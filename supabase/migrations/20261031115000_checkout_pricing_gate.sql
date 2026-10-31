begin;

insert into public.store_settings (key, value)
values ('checkout_pricing_approved', 'false'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function public.checkout_pricing_is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.value = 'true'::jsonb
    from public.store_settings s
    where s.key = 'checkout_pricing_approved'
  ), false);
$$;

revoke all on function public.checkout_pricing_is_approved() from public;
grant execute on function public.checkout_pricing_is_approved() to anon, authenticated;

create or replace function public.require_approved_checkout_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
     and new.payment_status = 'pending'
     and not public.checkout_pricing_is_approved() then
    raise exception 'Checkout is paused until delivery charges and tax treatment are approved';
  end if;
  return new;
end;
$$;

revoke all on function public.require_approved_checkout_pricing() from public;

drop trigger if exists orders_require_approved_checkout_pricing on public.orders;
create trigger orders_require_approved_checkout_pricing
before insert on public.orders
for each row
execute function public.require_approved_checkout_pricing();

commit;
