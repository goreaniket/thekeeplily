begin;

create or replace function public.admin_update_store_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting record;
  v_nested record;
  v_mode text;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
     or jsonb_object_length(p_settings) = 0
     or jsonb_object_length(p_settings) > 10 then
    raise exception 'A valid store settings object is required';
  end if;

  for v_setting in select key, value from jsonb_each(p_settings) loop
    if v_setting.key not in (
      'store_name','store_contact_email','store_contact_phone','store_contact_address',
      'notification_email','owner_notifications_enabled','store_status',
      'shipping_config','tax_config'
    ) then
      raise exception 'This store setting cannot be edited';
    end if;

    if v_setting.key in ('store_name','store_contact_email','store_contact_phone','store_contact_address','notification_email') then
      if jsonb_typeof(v_setting.value) not in ('string','null') then
        raise exception 'Store contact values must be text';
      end if;
      if v_setting.key = 'store_name'
         and v_setting.value <> 'null'::jsonb
         and (length(v_setting.value #>> '{}') not between 1 and 120) then
        raise exception 'Store name must be 1 to 120 characters';
      end if;
      if v_setting.key in ('store_contact_email','notification_email')
         and v_setting.value <> 'null'::jsonb
         and (length(v_setting.value #>> '{}') > 254
           or (v_setting.value #>> '{}') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception 'Enter a valid contact email address';
      end if;
      if v_setting.key = 'store_contact_phone'
         and v_setting.value <> 'null'::jsonb
         and length(v_setting.value #>> '{}') > 40 then
        raise exception 'Contact phone must be 40 characters or fewer';
      end if;
      if v_setting.key = 'store_contact_address'
         and v_setting.value <> 'null'::jsonb
         and length(v_setting.value #>> '{}') > 500 then
        raise exception 'Contact address must be 500 characters or fewer';
      end if;
    elsif v_setting.key = 'owner_notifications_enabled' then
      if jsonb_typeof(v_setting.value) is distinct from 'boolean' then
        raise exception 'Notification setting must be on or off';
      end if;
    elsif v_setting.key = 'store_status' then
      if jsonb_typeof(v_setting.value) is distinct from 'string'
         or v_setting.value #>> '{}' not in ('unconfigured','active','paused') then
        raise exception 'Store status is invalid';
      end if;
    elsif v_setting.key = 'shipping_config' then
      if jsonb_typeof(v_setting.value) is distinct from 'object' then
        raise exception 'Shipping configuration must be an object';
      end if;
      for v_nested in select key from jsonb_each(v_setting.value) loop
        if v_nested.key not in ('mode','amount') then
          raise exception 'Unsupported shipping configuration field';
        end if;
      end loop;
      v_mode := v_setting.value->>'mode';
      if v_mode = 'flat_rate' then
        if jsonb_typeof(v_setting.value->'amount') is distinct from 'number'
           or (v_setting.value->>'amount')::numeric < 0 then
          raise exception 'Flat-rate shipping requires a non-negative owner-entered amount';
        end if;
      elsif v_mode = 'unconfigured' then
        if coalesce(jsonb_typeof(v_setting.value->'amount'),'null') not in ('null') then
          raise exception 'Unconfigured shipping cannot have an amount';
        end if;
      else
        raise exception 'Shipping method is invalid';
      end if;
    elsif v_setting.key = 'tax_config' then
      if jsonb_typeof(v_setting.value) is distinct from 'object' then
        raise exception 'Tax configuration must be an object';
      end if;
      for v_nested in select key from jsonb_each(v_setting.value) loop
        if v_nested.key not in ('mode','rate') then
          raise exception 'Unsupported tax configuration field';
        end if;
      end loop;
      v_mode := v_setting.value->>'mode';
      if v_mode in ('inclusive','exclusive') then
        if jsonb_typeof(v_setting.value->'rate') is distinct from 'number'
           or (v_setting.value->>'rate')::numeric not between 0 and 100 then
          raise exception 'Tax treatment requires an owner-entered rate from 0 to 100';
        end if;
      elsif v_mode = 'unconfigured' then
        if coalesce(jsonb_typeof(v_setting.value->'rate'),'null') not in ('null') then
          raise exception 'Unconfigured tax cannot have a rate';
        end if;
      else
        raise exception 'Tax treatment is invalid';
      end if;
    end if;
  end loop;

  if p_settings->'owner_notifications_enabled' = 'true'::jsonb
     and (jsonb_typeof(p_settings->'notification_email') is distinct from 'string'
       or length(p_settings->>'notification_email') > 254
       or (p_settings->>'notification_email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Set a valid notification email before enabling notifications';
  end if;

  insert into public.store_settings(key, value)
  select key, value
  from jsonb_each(p_settings)
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
end;
$$;

revoke all on function public.admin_update_store_settings(jsonb) from public, anon;
grant execute on function public.admin_update_store_settings(jsonb) to authenticated;

create or replace function public.require_approved_checkout_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment' and new.payment_status = 'pending' then
    if not public.checkout_pricing_is_approved() then
      raise exception 'Checkout is paused until delivery charges and tax treatment are approved';
    end if;
    if not exists (
      select 1 from public.store_settings
      where key = 'store_status' and value = '"active"'::jsonb
    ) then
      raise exception 'Checkout is paused because the store is not marked open';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.require_approved_checkout_pricing() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-gift-uploads',
  'custom-gift-uploads',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Customers upload own custom gift references" on storage.objects;
create policy "Customers upload own custom gift references"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'custom-gift-uploads'
    and storage.foldername(name)[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.custom_gift_requests r
      where r.id::text = storage.foldername(name)[2]
        and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "Customers and admins view custom gift references" on storage.objects;
create policy "Customers and admins view custom gift references"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'custom-gift-uploads'
    and (
      (select public.is_admin())
      or exists (
        select 1
        from public.custom_gift_requests r
        where r.id::text = storage.foldername(name)[2]
          and r.user_id = (select auth.uid())
          and storage.foldername(name)[1] = (select auth.uid())::text
      )
    )
  );

drop policy if exists "Customers delete own custom gift references" on storage.objects;
create policy "Customers delete own custom gift references"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'custom-gift-uploads'
    and (
      (select public.is_admin())
      or exists (
        select 1
        from public.custom_gift_requests r
        where r.id::text = storage.foldername(name)[2]
          and r.user_id = (select auth.uid())
          and storage.foldername(name)[1] = (select auth.uid())::text
      )
    )
  );

create or replace function public.customer_attach_custom_gift_references(
  p_request_id uuid,
  p_storage_paths text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
  v_existing text[];
  v_new_paths text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception 'Sign in is required to attach private reference images';
  end if;
  if p_storage_paths is null
     or cardinality(p_storage_paths) not between 1 and 3
     or (select count(distinct path) from unnest(p_storage_paths) as paths(path)) <> cardinality(p_storage_paths) then
    raise exception 'Choose between one and three distinct reference images';
  end if;

  select reference_storage_paths into v_existing
  from public.custom_gift_requests
  where id = p_request_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Custom gift request not found for this account';
  end if;
  foreach v_path in array p_storage_paths loop
    if v_path !~ ('^' || v_uid::text || '/' || p_request_id::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$')
    then
      raise exception 'A reference image path is invalid';
    end if;
    if v_path = any(coalesce(v_existing, array[]::text[])) then
      continue;
    end if;
    if not exists (
         select 1 from storage.objects
         where bucket_id = 'custom-gift-uploads' and name = v_path
       ) then
      raise exception 'A reference image was not uploaded';
    end if;
    v_new_paths := array_append(v_new_paths, v_path);
  end loop;

  if cardinality(coalesce(v_existing, array[]::text[])) + cardinality(v_new_paths) > 3 then
    raise exception 'A custom gift request can have at most three reference images';
  end if;

  update public.custom_gift_requests
  set reference_storage_paths = array_cat(coalesce(v_existing, array[]::text[]), v_new_paths),
      updated_at = now()
  where id = p_request_id and user_id = v_uid;
end;
$$;

revoke all on function public.customer_attach_custom_gift_references(uuid, text[]) from public, anon;
grant execute on function public.customer_attach_custom_gift_references(uuid, text[]) to authenticated;

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
  v_recent_count integer;
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

  perform pg_advisory_xact_lock(hashtextextended('gift-email:' || v_email, 0));
  select count(*) into v_recent_count
  from public.custom_gift_requests
  where lower(email) = v_email and created_at > now() - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception 'Too many custom gift requests were submitted from this email. Please try again later.';
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

create table if not exists public.owner_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('new_order','payment_succeeded','contact_message','custom_gift_request')),
  source_id uuid not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(event_type, source_id)
);

alter table public.owner_notification_outbox enable row level security;
revoke all on public.owner_notification_outbox from public, anon, authenticated;
grant all on public.owner_notification_outbox to service_role;

create or replace function public.enqueue_owner_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_source_id uuid;
begin
  if tg_table_name = 'payments' then
    if new.status is distinct from 'paid' or old.status = 'paid' then
      return new;
    end if;
    v_event_type := 'payment_succeeded';
    v_source_id := new.id;
  elsif tg_table_name = 'orders' then
    v_event_type := 'new_order';
    v_source_id := new.id;
  elsif tg_table_name = 'contact_messages' then
    v_event_type := 'contact_message';
    v_source_id := new.id;
  elsif tg_table_name = 'custom_gift_requests' then
    v_event_type := 'custom_gift_request';
    v_source_id := new.id;
  else
    raise exception 'Unsupported notification source';
  end if;

  insert into public.owner_notification_outbox(event_type, source_id)
  values (v_event_type, v_source_id)
  on conflict (event_type, source_id) do nothing;
  return new;
end;
$$;

drop trigger if exists orders_enqueue_owner_notification on public.orders;
create trigger orders_enqueue_owner_notification
  after insert on public.orders
  for each row execute function public.enqueue_owner_notification();

drop trigger if exists payments_enqueue_owner_notification on public.payments;
create trigger payments_enqueue_owner_notification
  after update of status on public.payments
  for each row when (new.status = 'paid' and old.status is distinct from new.status)
  execute function public.enqueue_owner_notification();

drop trigger if exists contact_messages_enqueue_owner_notification on public.contact_messages;
create trigger contact_messages_enqueue_owner_notification
  after insert on public.contact_messages
  for each row execute function public.enqueue_owner_notification();

drop trigger if exists custom_gift_requests_enqueue_owner_notification on public.custom_gift_requests;
create trigger custom_gift_requests_enqueue_owner_notification
  after insert on public.custom_gift_requests
  for each row execute function public.enqueue_owner_notification();

create or replace function public.claim_owner_notification(p_notification_id uuid)
returns table(event_type text, source_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.owner_notification_outbox o
  set status = 'processing', attempts = o.attempts + 1
  where o.id = p_notification_id
    and o.status in ('pending','failed')
    and o.attempts < 3
  returning o.event_type, o.source_id, o.attempts;
end;
$$;

create or replace function public.finish_owner_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sent then
    update public.owner_notification_outbox
    set status = 'sent', sent_at = now(), last_error = null
    where id = p_notification_id and status = 'processing';
  else
    update public.owner_notification_outbox
    set status = 'failed', last_error = left(coalesce(p_error, 'Delivery failed'), 300)
    where id = p_notification_id and status = 'processing';
  end if;
  if not found then
    raise exception 'Notification was not in a claimable processing state';
  end if;
end;
$$;

revoke all on function public.enqueue_owner_notification() from public, anon, authenticated;
revoke all on function public.claim_owner_notification(uuid) from public, anon, authenticated;
revoke all on function public.finish_owner_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_owner_notification(uuid) to service_role;
grant execute on function public.finish_owner_notification(uuid, boolean, text) to service_role;

commit;
