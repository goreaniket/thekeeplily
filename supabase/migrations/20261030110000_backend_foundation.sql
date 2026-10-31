-- TheKeeplily Co. — additive customer, forms, and order foundation.
-- Run after schema.sql and 20261030_contact_messages.sql. Safe to re-run.

begin;

create table if not exists public.customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  transaction_type text not null check (transaction_type in ('order', 'restock', 'adjustment', 'release')),
  quantity_delta integer not null,
  quantity_requested integer not null default 0 check (quantity_requested >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_product_created_idx
  on public.inventory_transactions(product_id, created_at desc);
create index if not exists inventory_transactions_order_idx
  on public.inventory_transactions(order_id)
  where order_id is not null;
create index if not exists customers_email_idx on public.customers(lower(email));

alter table public.orders
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_fingerprint text;
alter table public.order_items
  add column if not exists is_customised boolean not null default false;
create unique index if not exists orders_user_idempotency_idx
  on public.orders(user_id, idempotency_key)
  where user_id is not null and idempotency_key is not null;

create or replace function public.set_customer_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_customer_updated_at();

create or replace function public.protect_customer_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at) then
    raise exception 'Customer identity fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_protect_identity on public.customers;
create trigger customers_protect_identity
  before update on public.customers
  for each row execute function public.protect_customer_identity();

create or replace function public.audit_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock_quantity;
  else
    v_delta := new.stock_quantity - old.stock_quantity;
  end if;
  if v_delta = 0 or current_setting('keeplily.skip_inventory_audit', true) = 'true' then
    return new;
  end if;

  insert into public.inventory_transactions (
    product_id, transaction_type, quantity_delta, quantity_requested, note, created_by
  )
  values (
    new.id,
    case when v_delta > 0 then 'restock' else 'adjustment' end,
    v_delta,
    abs(v_delta),
    'Product stock edited by an administrator',
    (select auth.uid())
  );
  return new;
end;
$$;

drop trigger if exists products_audit_stock_change on public.products;
create trigger products_audit_stock_change
  after update of stock_quantity on public.products
  for each row execute function public.audit_product_stock_change();
drop trigger if exists products_audit_stock_insert on public.products;
create trigger products_audit_stock_insert
  after insert on public.products
  for each row execute function public.audit_product_stock_change();

create or replace function public.sync_customer_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null then
    insert into public.customers (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do update set email = excluded.email;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_customer_created on auth.users;
create trigger on_auth_user_customer_created
  after insert on auth.users
  for each row execute function public.sync_customer_auth_user();

drop trigger if exists on_auth_user_customer_updated on auth.users;
create trigger on_auth_user_customer_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_customer_auth_user();

insert into public.customers (user_id, email)
select u.id, lower(u.email)
from auth.users u
join public.profiles p on p.id = u.id
where u.email is not null
on conflict (user_id) do update set email = excluded.email;

alter table public.customers enable row level security;
alter table public.inventory_transactions enable row level security;
grant select, update (marketing_consent) on public.customers to authenticated;
grant select on public.inventory_transactions to authenticated;
grant select on public.orders, public.order_items, public.payments to authenticated;
grant select on public.contact_messages, public.newsletter_subscribers to authenticated;
grant select, update on public.custom_gift_requests to authenticated;
revoke all on public.customers from anon;
revoke all on public.inventory_transactions from anon;
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

drop policy if exists "Customers read own customer record" on public.customers;
create policy "Customers read own customer record"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Customers update own marketing preference" on public.customers;
create policy "Customers update own marketing preference"
  on public.customers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Admins read inventory transactions" on public.inventory_transactions;
create policy "Admins read inventory transactions"
  on public.inventory_transactions for select to authenticated
  using ((select public.is_admin()));

-- Order data is created atomically by create_customer_order, and order status
-- is changed only by the admin RPC. Browser clients cannot write totals/statuses.
drop policy if exists "Customers read own orders" on public.orders;
drop policy if exists "Admins manage orders" on public.orders;
drop policy if exists "Customers read own order items" on public.order_items;
drop policy if exists "Admins manage order items" on public.order_items;
drop policy if exists "Admins read payments" on public.payments;

create policy "Customers and admins read orders"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Customers and admins read order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

create policy "Admins read payments"
  on public.payments for select to authenticated
  using ((select public.is_admin()));

revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;
revoke insert, update, delete on public.inventory_transactions from anon, authenticated;
revoke insert, delete on public.customers from anon, authenticated;
revoke insert, update, delete on public.contact_messages from anon, authenticated;
revoke insert, update, delete on public.newsletter_subscribers from anon, authenticated;
revoke insert on public.custom_gift_requests from anon, authenticated;

drop policy if exists "Public can submit contact messages" on public.contact_messages;
drop policy if exists "Admins manage contact messages" on public.contact_messages;
create policy "Admins manage contact messages"
  on public.contact_messages for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Public can submit custom gift requests" on public.custom_gift_requests;
create policy "Admins manage custom gift requests"
  on public.custom_gift_requests for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists "Customers read own custom gift requests" on public.custom_gift_requests;
create policy "Customers read own custom gift requests"
  on public.custom_gift_requests for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
drop policy if exists "Admins manage newsletter" on public.newsletter_subscribers;
create policy "Admins manage newsletter"
  on public.newsletter_subscribers for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Active coupons can be validated" on public.coupons;

create or replace function public.submit_newsletter_subscription(
  p_email text,
  p_website text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Invalid submission';
  end if;
  if length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  if exists (
    select 1 from public.newsletter_subscribers
    where lower(email) = v_email
  ) then
    return true;
  end if;

  insert into public.newsletter_subscribers (email, is_active)
  values (v_email, true);
  return false;
end;
$$;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_website text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Invalid submission';
  end if;
  if length(v_name) not between 1 and 120
     or length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_subject) not between 1 and 180
     or length(v_message) not between 1 and 5000
     or (v_phone is not null and length(v_phone) > 40) then
    raise exception 'Please check the contact form fields';
  end if;

  insert into public.contact_messages (name, email, phone, subject, message, status)
  values (v_name, v_email, v_phone, v_subject, v_message, 'new')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_custom_gift_request(
  p_name text,
  p_email text,
  p_phone text,
  p_occasion text,
  p_gift_type text,
  p_budget_min numeric,
  p_budget_max numeric,
  p_required_by date,
  p_quantity integer,
  p_preferred_colours text,
  p_description text,
  p_gift_message text,
  p_website text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_description text := btrim(coalesce(p_description, ''));
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Invalid submission';
  end if;
  if length(v_name) not between 1 and 120
     or length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_phone) not between 1 and 40
     or length(btrim(coalesce(p_occasion, ''))) > 120
     or length(btrim(coalesce(p_gift_type, ''))) > 120
     or (p_budget_min is not null and p_budget_min < 0)
     or (p_budget_max is not null and p_budget_max < 0)
     or (p_budget_min is not null and p_budget_max is not null and p_budget_max < p_budget_min)
     or coalesce(p_quantity, 0) not between 1 and 100
     or length(btrim(coalesce(p_preferred_colours, ''))) > 500
     or length(v_description) not between 1 and 7000
     or length(coalesce(p_gift_message, '')) > 1000 then
    raise exception 'Please check the custom gift form fields';
  end if;

  insert into public.custom_gift_requests (
    user_id, name, email, phone, occasion, gift_type, budget_min, budget_max,
    required_by, quantity, preferred_colours, description, gift_message, status
  )
  values (
    (select auth.uid()), v_name, v_email, v_phone,
    nullif(btrim(coalesce(p_occasion, '')), ''),
    nullif(btrim(coalesce(p_gift_type, '')), ''),
    p_budget_min, p_budget_max, p_required_by, p_quantity,
    nullif(btrim(coalesce(p_preferred_colours, '')), ''),
    v_description, nullif(btrim(coalesce(p_gift_message, '')), ''), 'new'
  )
  returning id into v_id;
  return v_id;
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
  v_stock_delta integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before placing an order';
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

  for v_item in
    select p.id, p.stock_quantity, p.track_inventory, p.allow_backorder,
           sum(item.quantity)::integer as requested
    from public.products p
    join jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
      on item.product_id = p.id
    group by p.id, p.stock_quantity, p.track_inventory, p.allow_backorder
    order by p.id
  loop
    if v_item.track_inventory then
      v_stock_delta := least(v_item.stock_quantity, v_item.requested);
      perform set_config('keeplily.skip_inventory_audit', 'true', true);
      update public.products
      set stock_quantity = stock_quantity - v_stock_delta
      where id = v_item.id;
      perform set_config('keeplily.skip_inventory_audit', 'false', true);
      insert into public.inventory_transactions (
        product_id, order_id, transaction_type, quantity_delta, quantity_requested, created_by
      )
      values (
        v_item.id, v_order_id, 'order', -v_stock_delta, v_item.requested, v_user_id
      );
    end if;
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

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;
  update public.orders
  set status = p_status
  where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
end;
$$;

revoke all on function public.submit_newsletter_subscription(text, text) from public;
revoke all on function public.submit_contact_message(text, text, text, text, text, text) from public;
revoke all on function public.submit_custom_gift_request(text, text, text, text, text, numeric, numeric, date, integer, text, text, text, text) from public;
revoke all on function public.create_customer_order(jsonb, jsonb, text, uuid) from public;
revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;

grant execute on function public.submit_newsletter_subscription(text, text) to anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_custom_gift_request(text, text, text, text, text, numeric, numeric, date, integer, text, text, text, text) to anon, authenticated;
grant execute on function public.create_customer_order(jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

commit;
