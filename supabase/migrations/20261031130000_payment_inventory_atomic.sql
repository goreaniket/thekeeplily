-- Create unpaid orders without mutating inventory; decrement stock only after verified payment.
-- Requires 20261031125000_add_payment_review_order_status.sql.

begin;

alter table public.inventory_transactions
  add column if not exists reversal_of uuid
  references public.inventory_transactions(id) on delete set null;

create unique index if not exists inventory_transactions_reversal_idx
  on public.inventory_transactions(reversal_of)
  where reversal_of is not null;

do $$
declare
  v_transaction record;
  v_release_id uuid;
begin
  for v_transaction in
    select it.id, it.product_id, it.order_id, it.quantity_delta, it.quantity_requested, o.user_id
    from public.inventory_transactions it
    join public.orders o on o.id = it.order_id
    where it.transaction_type = 'order'
      and it.quantity_delta < 0
      and o.payment_status in ('pending', 'failed')
      and o.status in ('pending_payment', 'cancelled')
      and not exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.provider = 'razorpay' and p.status <> 'failed'
      )
    order by it.id
  loop
    v_release_id := null;
    insert into public.inventory_transactions (
      product_id, order_id, transaction_type, quantity_delta, quantity_requested,
      note, created_by, reversal_of
    )
    values (
      v_transaction.product_id, v_transaction.order_id, 'release',
      abs(v_transaction.quantity_delta), v_transaction.quantity_requested,
      'Restored stock from an unpaid order during the payment inventory migration',
      v_transaction.user_id, v_transaction.id
    )
    on conflict (reversal_of) where reversal_of is not null do nothing
    returning id into v_release_id;

    if v_release_id is not null then
      perform set_config('keeplily.skip_inventory_audit', 'true', true);
      update public.products
      set stock_quantity = stock_quantity + abs(v_transaction.quantity_delta)
      where id = v_transaction.product_id;
      if not found then
        raise exception 'Could not restore stock for an unpaid order';
      end if;
      perform set_config('keeplily.skip_inventory_audit', 'false', true);
    end if;
  end loop;
end;
$$;

create or replace function public.create_customer_order(
  p_items jsonb,
  p_shipping_address jsonb,
  p_customer_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_existing jsonb;
  v_fingerprint text;
  v_item record;
  v_product public.products%rowtype;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_order_number text;
  v_variant_adjustment numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in before placing an order';
  end if;
  if not public.checkout_pricing_is_approved() then
    raise exception 'Checkout is paused until delivery charges and tax treatment are approved';
  end if;
  if p_idempotency_key is null then
    raise exception 'Order request key is required';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Your cart is invalid';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Your cart is empty or contains too many items';
  end if;
  if jsonb_typeof(p_shipping_address) <> 'object'
     or length(btrim(coalesce(p_shipping_address->>'full_name', ''))) not between 1 and 120
     or length(btrim(coalesce(p_shipping_address->>'phone', ''))) not between 1 and 40
     or length(btrim(coalesce(p_shipping_address->>'address_line_1', ''))) not between 1 and 240
     or length(btrim(coalesce(p_shipping_address->>'city', ''))) not between 1 and 120
     or length(btrim(coalesce(p_shipping_address->>'state', ''))) not between 1 and 120
     or length(btrim(coalesce(p_shipping_address->>'postal_code', ''))) not between 1 and 20 then
    raise exception 'Please provide a complete delivery address';
  end if;
  if length(coalesce(p_customer_note, '')) > 1000 then
    raise exception 'The order note is too long';
  end if;

  v_fingerprint := p_items::text || E'\n' || p_shipping_address::text || E'\n' || coalesce(p_customer_note, '');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0));
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'grand_total', o.grand_total,
    'status', o.status,
    'payment_status', o.payment_status
  )
  into v_existing
  from public.orders o
  where o.user_id = v_user_id
    and o.idempotency_key = p_idempotency_key
    and o.idempotency_fingerprint = v_fingerprint;
  if v_existing is not null then
    return v_existing;
  end if;
  if exists (
    select 1 from public.orders o
    where o.user_id = v_user_id and o.idempotency_key = p_idempotency_key
  ) then
    raise exception 'This order request key was already used for a different order';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user_id;
  if v_email is null then
    raise exception 'The signed-in account does not have an email address';
  end if;

  perform p.id
  from public.products p
  where p.id in (
    select distinct (item.value->>'product_id')::uuid
    from jsonb_array_elements(p_items) item
  )
  order by p.id
  for update;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      variant text,
      personalisation text,
      customisation boolean,
      gift_message text,
      quantity integer
    )
  loop
    if v_item.product_id is null or coalesce(v_item.quantity, 0) not between 1 and 99 then
      raise exception 'A cart item is invalid';
    end if;
    select p.* into v_product
    from public.products p
    where p.id = v_item.product_id and p.status = 'active';
    if not found then
      raise exception 'A product in your cart is no longer available';
    end if;
    if v_product.currency <> 'INR' then
      raise exception 'A product in your cart uses an unsupported currency';
    end if;

    if jsonb_array_length(v_product.variants) > 0 then
      if not exists (
        select 1
        from jsonb_array_elements(v_product.variants) variant_item(value)
        where case
          when jsonb_typeof(variant_item.value) = 'object'
            then variant_item.value->>'name' = coalesce(v_item.variant, '')
          else variant_item.value #>> '{}' = coalesce(v_item.variant, '')
        end
      ) then
        raise exception 'A product option in your cart is no longer available';
      end if;
    elsif coalesce(v_item.variant, 'One size') <> 'One size' then
      raise exception 'A product option in your cart is no longer available';
    end if;

    v_variant_adjustment := 0;
    select coalesce(
      nullif(variant_item.value->>'price_adjustment', '')::numeric,
      0
    )
    into v_variant_adjustment
    from jsonb_array_elements(v_product.variants) variant_item(value)
    where jsonb_typeof(variant_item.value) = 'object'
      and variant_item.value->>'name' = coalesce(v_item.variant, '')
    limit 1;
    v_variant_adjustment := coalesce(v_variant_adjustment, 0);

    if coalesce(v_item.customisation, false) and not v_product.is_customisable then
      raise exception 'A product in your cart cannot be customised';
    end if;
    if length(coalesce(v_item.personalisation, '')) > 500
       or length(coalesce(v_item.gift_message, '')) > 1000 then
      raise exception 'A personalisation field is too long';
    end if;

    v_unit_price := coalesce(v_product.sale_price, v_product.price)
      + v_variant_adjustment
      + case when coalesce(v_item.customisation, false) then v_product.customisation_charge else 0 end;
    if v_unit_price < 0 then
      raise exception 'A product price is invalid';
    end if;
    v_line_total := round(v_unit_price * v_item.quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'sku_snapshot', v_product.sku,
      'name_snapshot', v_product.name,
      'variant_snapshot', v_item.variant,
      'personalisation', nullif(btrim(coalesce(v_item.personalisation, '')), ''),
      'gift_message', nullif(btrim(coalesce(v_item.gift_message, '')), ''),
      'is_customised', coalesce(v_item.customisation, false),
      'unit_price', v_unit_price,
      'quantity', v_item.quantity,
      'line_total', v_line_total,
      'product_snapshot', jsonb_build_object('slug', v_product.slug)
    ));
  end loop;

  for v_item in
    select p.id, p.stock_quantity, p.track_inventory, p.allow_backorder,
           sum(item.quantity)::integer as requested
    from public.products p
    join jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
      on item.product_id = p.id
    group by p.id, p.stock_quantity, p.track_inventory, p.allow_backorder
    order by p.id
  loop
    if v_item.track_inventory and not v_item.allow_backorder
       and v_item.stock_quantity < v_item.requested then
      raise exception 'There is not enough stock for a product in your cart';
    end if;
  end loop;

  v_order_number := 'KL-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.orders (
    order_number, user_id, guest_email, guest_phone, status, payment_status,
    currency, subtotal, discount_total, shipping_total, tax_total, grand_total,
    customer_note, billing_address, shipping_address, idempotency_key, idempotency_fingerprint
  )
  values (
    v_order_number, v_user_id, v_email,
    nullif(btrim(coalesce(p_shipping_address->>'phone', '')), ''),
    'pending_payment', 'pending', 'INR', v_subtotal, 0, 0, 0, v_subtotal,
    nullif(btrim(coalesce(p_customer_note, '')), ''),
    p_shipping_address, p_shipping_address, p_idempotency_key, v_fingerprint
  )
  returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items (
      order_id, product_id, sku_snapshot, name_snapshot, variant_snapshot,
      personalisation, gift_message, is_customised, unit_price, quantity, line_total, product_snapshot
    )
    values (
      v_order_id,
      (v_line->>'product_id')::uuid,
      v_line->>'sku_snapshot',
      v_line->>'name_snapshot',
      v_line->>'variant_snapshot',
      v_line->>'personalisation',
      v_line->>'gift_message',
      (v_line->>'is_customised')::boolean,
      (v_line->>'unit_price')::numeric,
      (v_line->>'quantity')::integer,
      (v_line->>'line_total')::numeric,
      v_line->'product_snapshot'
    );
  end loop;


  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'grand_total', v_subtotal,
    'status', 'pending_payment',
    'payment_status', 'pending'
  );
end;
$$;


create or replace function public.confirm_razorpay_payment(
  p_payment_id uuid,
  p_order_id uuid,
  p_provider_payment_id text,
  p_signature text,
  p_raw_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_item record;
  v_stock_delta integer;
  v_needs_review boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(btrim(coalesce(p_provider_payment_id, '')), '') is null
     or nullif(btrim(coalesce(p_signature, '')), '') is null then
    raise exception 'Verified payment details are required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_payment from public.payments
  where id = p_payment_id and order_id = p_order_id and provider = 'razorpay'
  for update;
  if not found then raise exception 'Payment record not found'; end if;

  if v_order.payment_status = 'paid' and v_payment.status = 'paid'
     and v_payment.provider_payment_id = p_provider_payment_id then
    return v_order.status <> 'payment_review';
  end if;

  if v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment'
     or v_payment.status <> 'pending' then
    raise exception 'Order is no longer awaiting payment';
  end if;
  if v_order.currency <> 'INR' or v_payment.currency <> 'INR'
     or round(v_order.grand_total, 2) <> round(v_payment.amount, 2) then
    raise exception 'Payment amount or currency does not match the order';
  end if;

  perform p.id
  from public.products p
  where p.id in (
    select distinct oi.product_id
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
  )
  order by p.id
  for update;

  if exists (
    select 1 from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is null
  ) then
    v_needs_review := true;
  end if;

  for v_item in
    select p.id, p.status, p.stock_quantity, p.track_inventory, p.allow_backorder,
           sum(oi.quantity)::integer as requested
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    group by p.id, p.status, p.stock_quantity, p.track_inventory, p.allow_backorder
    order by p.id
  loop
    if v_item.status <> 'active'
       or (v_item.track_inventory and not v_item.allow_backorder
           and v_item.stock_quantity < v_item.requested) then
      v_needs_review := true;
    end if;
  end loop;

  if not v_needs_review then
    for v_item in
      select p.id, p.stock_quantity, p.track_inventory, p.allow_backorder,
             sum(oi.quantity)::integer as requested
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
      group by p.id, p.stock_quantity, p.track_inventory, p.allow_backorder
      order by p.id
    loop
      if v_item.track_inventory then
        v_stock_delta := least(v_item.stock_quantity, v_item.requested);
        if v_stock_delta > 0 then
          perform set_config('keeplily.skip_inventory_audit', 'true', true);
          update public.products
          set stock_quantity = stock_quantity - v_stock_delta
          where id = v_item.id and stock_quantity >= v_stock_delta;
          if not found then
            raise exception 'Stock changed while confirming payment';
          end if;
          perform set_config('keeplily.skip_inventory_audit', 'false', true);
        end if;
        insert into public.inventory_transactions (
          product_id, order_id, transaction_type, quantity_delta, quantity_requested, created_by
        )
        values (
          v_item.id, p_order_id, 'order', -v_stock_delta, v_item.requested, v_order.user_id
        );
      end if;
    end loop;
  end if;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      provider_signature = p_signature,
      status = 'paid',
      paid_at = now(),
      raw_response = coalesce(p_raw_response, '{}'::jsonb),
      updated_at = now()
  where id = p_payment_id;

  update public.orders
  set payment_status = 'paid',
      status = case when v_needs_review then 'payment_review'::public.order_status else 'confirmed'::public.order_status end,
      updated_at = now()
  where id = p_order_id;

  return not v_needs_review;
end;
$$;

revoke all on function public.confirm_razorpay_payment(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_razorpay_payment(uuid, uuid, text, text, jsonb) to service_role;

create or replace function public.record_razorpay_payment_failure(
  p_payment_id uuid,
  p_order_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_raw_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(btrim(coalesce(p_provider_order_id, '')), '') is null
     or nullif(btrim(coalesce(p_provider_payment_id, '')), '') is null then
    raise exception 'Verified failure details are required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_payment from public.payments
  where id = p_payment_id and order_id = p_order_id and provider = 'razorpay'
  for update;
  if not found then raise exception 'Payment record not found'; end if;

  if v_payment.status = 'failed'
     and v_payment.provider_order_id = p_provider_order_id
     and v_payment.provider_payment_id = p_provider_payment_id then
    return true;
  end if;
  if v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment'
     or v_payment.status <> 'pending'
     or v_payment.provider_order_id <> p_provider_order_id then
    raise exception 'Order is no longer awaiting this payment';
  end if;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      status = 'failed',
      raw_response = coalesce(p_raw_response, '{}'::jsonb),
      updated_at = now()
  where id = p_payment_id;

  return true;
end;
$$;

revoke all on function public.record_razorpay_payment_failure(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_razorpay_payment_failure(uuid, uuid, text, text, jsonb) to service_role;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_stock_delta integer;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'payment_review' and v_order.status <> 'payment_review' then
    raise exception 'Payment review is assigned only by verified payment processing';
  end if;
  if p_status = 'refunded' and v_order.payment_status <> 'refunded' then
    raise exception 'Record the verified refund before marking this order refunded';
  end if;
  if p_status in ('confirmed', 'preparing', 'ready_to_ship', 'shipped', 'delivered')
     and v_order.payment_status <> 'paid' then
    raise exception 'A verified payment is required before fulfillment';
  end if;
  if v_order.status = 'payment_review'
     and p_status in ('preparing', 'ready_to_ship', 'shipped', 'delivered') then
    raise exception 'Resolve the payment review by confirming the order first';
  end if;

  if v_order.status = 'payment_review' and p_status = 'confirmed' then
    if exists (
      select 1 from public.order_items oi
      where oi.order_id = p_order_id and oi.product_id is null
    ) then
      raise exception 'Restore the missing product before confirming this order';
    end if;
    if exists (
      select 1
      from public.inventory_transactions it
      where it.order_id = p_order_id
        and it.transaction_type = 'order'
        and not exists (
          select 1
          from public.inventory_transactions release
          where release.reversal_of = it.id
        )
    ) then
      raise exception 'Inventory was already deducted for this order';
    end if;

    perform p.id
    from public.products p
    where p.id in (
      select distinct oi.product_id
      from public.order_items oi
      where oi.order_id = p_order_id and oi.product_id is not null
    )
    order by p.id
    for update;

    for v_item in
      select p.id, p.status, p.stock_quantity, p.track_inventory, p.allow_backorder,
             sum(oi.quantity)::integer as requested
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
      group by p.id, p.status, p.stock_quantity, p.track_inventory, p.allow_backorder
      order by p.id
    loop
      if v_item.status <> 'active'
         or (v_item.track_inventory and not v_item.allow_backorder
             and v_item.stock_quantity < v_item.requested) then
        raise exception 'Resolve product availability and stock before confirming this order';
      end if;
    end loop;

    for v_item in
      select p.id, p.stock_quantity, p.track_inventory, p.allow_backorder,
             sum(oi.quantity)::integer as requested
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
      group by p.id, p.stock_quantity, p.track_inventory, p.allow_backorder
      order by p.id
    loop
      if v_item.track_inventory then
        v_stock_delta := least(v_item.stock_quantity, v_item.requested);
        if v_stock_delta > 0 then
          perform set_config('keeplily.skip_inventory_audit', 'true', true);
          update public.products
          set stock_quantity = stock_quantity - v_stock_delta
          where id = v_item.id and stock_quantity >= v_stock_delta;
          if not found then
            raise exception 'Stock changed while confirming the reviewed order';
          end if;
          perform set_config('keeplily.skip_inventory_audit', 'false', true);
        end if;
        insert into public.inventory_transactions (
          product_id, order_id, transaction_type, quantity_delta, quantity_requested, created_by
        )
        values (
          v_item.id, p_order_id, 'order', -v_stock_delta, v_item.requested, v_order.user_id
        );
      end if;
    end loop;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end;
$$;

revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

commit;
