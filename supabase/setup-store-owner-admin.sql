-- Run in Supabase SQL Editor only after the owner has created or accepted
-- their Auth account and verified the exact owner email address.
-- This does not create an account or expose an admin-registration endpoint.

begin;

do $$
declare
  v_owner_id uuid;
  v_owner_count integer;
  v_updated integer;
begin
  select count(*)
  into v_owner_count
  from auth.users
  where lower(email) = lower('thekeeplilyco26@gmail.com')
    and email_confirmed_at is not null;

  if v_owner_count <> 1 then
    raise exception 'Expected exactly one confirmed Auth account for the store owner; found %', v_owner_count;
  end if;

  select id
  into v_owner_id
  from auth.users
  where lower(email) = lower('thekeeplilyco26@gmail.com')
    and email_confirmed_at is not null;

  if not exists (select 1 from public.profiles where id = v_owner_id) then
    raise exception 'The owner profile is missing. Run the schema and verify the Auth account before promotion.';
  end if;

  update public.profiles
  set role = 'admin',
      updated_at = now()
  where id = v_owner_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'Owner promotion did not update exactly one profile';
  end if;
end;
$$;

select u.email, u.email_confirmed_at, p.role, p.full_name
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('thekeeplilyco26@gmail.com');

commit;
