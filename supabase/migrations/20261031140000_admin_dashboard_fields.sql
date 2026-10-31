begin;

alter table public.orders
  add column if not exists admin_notes text;

alter table public.custom_gift_requests
  add column if not exists quoted_amount numeric(12,2)
    check (quoted_amount is null or quoted_amount >= 0),
  add column if not exists quote_notes text;

alter table public.contact_messages
  add column if not exists submission_key uuid;

create unique index if not exists contact_messages_submission_key_idx
  on public.contact_messages(submission_key)
  where submission_key is not null;

drop function if exists public.submit_contact_message(text, text, text, text, text, text);

create function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_website text,
  p_submission_key uuid
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
  v_existing public.contact_messages%rowtype;
  v_recent_count integer;
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Invalid submission';
  end if;
  if length(v_name) not between 1 and 120
     or length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_subject) not between 1 and 180
     or length(v_message) not between 1 and 5000
     or (v_phone is not null and length(v_phone) > 40)
     or p_submission_key is null then
    raise exception 'Please check the contact form fields';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('contact-key:' || p_submission_key::text, 0));
  select *
  into v_existing
  from public.contact_messages
  where submission_key = p_submission_key;
  if found then
    if v_existing.name is distinct from v_name
       or lower(v_existing.email) is distinct from v_email
       or v_existing.phone is distinct from v_phone
       or v_existing.subject is distinct from v_subject
       or v_existing.message is distinct from v_message then
      raise exception 'This contact submission key was already used';
    end if;
    return v_existing.id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('contact-email:' || v_email, 0));
  select count(*) into v_recent_count
  from public.contact_messages
  where lower(email) = v_email and created_at > now() - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception 'Too many messages were submitted from this email. Please try again later.';
  end if;

  select id into v_id
  from public.contact_messages
  where lower(email) = v_email
    and subject = v_subject
    and message = v_message
    and created_at > now() - interval '5 minutes'
  order by created_at desc
  limit 1;
  if found then
    return v_id;
  end if;

  insert into public.contact_messages (
    name, email, phone, subject, message, status, submission_key
  )
  values (
    v_name, v_email, v_phone, v_subject, v_message, 'new', p_submission_key
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, uuid) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, uuid) to anon, authenticated;

create or replace function public.admin_update_order_notes(
  p_order_id uuid,
  p_admin_notes text
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
  if length(coalesce(p_admin_notes, '')) > 5000 then
    raise exception 'Internal notes must be 5000 characters or fewer';
  end if;

  update public.orders
  set admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
      updated_at = now()
  where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
end;
$$;

revoke all on function public.admin_update_order_notes(uuid, text) from public, anon;
grant execute on function public.admin_update_order_notes(uuid, text) to authenticated;

create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_low_stock_threshold numeric;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;

  select case
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric
    when jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^[0-9]+$'
      then (value #>> '{}')::numeric
    else null
  end
  into v_low_stock_threshold
  from public.store_settings
  where key = 'low_stock_threshold';

  return jsonb_build_object(
    'total_orders', (select count(*) from public.orders),
    'paid_revenue', (select coalesce(sum(grand_total), 0) from public.orders where payment_status = 'paid'),
    'pending_orders', (select count(*) from public.orders where status = 'pending_payment'),
    'processing_orders', (select count(*) from public.orders where status in ('confirmed','preparing','ready_to_ship')),
    'shipped_orders', (select count(*) from public.orders where status = 'shipped'),
    'delivered_orders', (select count(*) from public.orders where status = 'delivered'),
    'cancelled_refunded_orders', (select count(*) from public.orders where status in ('cancelled','refunded')),
    'total_customers', (select count(*) from public.customers),
    'active_products', (select count(*) from public.products where status = 'active'),
    'low_stock_products', case
      when v_low_stock_threshold is null then null
      else (select count(*) from public.products
        where status = 'active' and track_inventory and stock_quantity <= v_low_stock_threshold)
    end,
    'low_stock_threshold', v_low_stock_threshold,
    'new_gift_requests', (select count(*) from public.custom_gift_requests where status = 'new'),
    'new_contact_messages', (select count(*) from public.contact_messages where status = 'new'),
    'active_newsletter_subscribers', (select count(*) from public.newsletter_subscribers where is_active)
  );
end;
$$;

revoke all on function public.admin_dashboard_overview() from public, anon;
grant execute on function public.admin_dashboard_overview() to authenticated;

commit;
