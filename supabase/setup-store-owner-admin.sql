-- TheKeeplily Co. — promote the store owner's existing Supabase Auth account.
-- Run this only AFTER the owner has been created in Authentication → Users.
-- This targets the confirmed owner login email and does not create an account.
-- If no row is updated, create/invite the Auth user first, then run again.

update public.profiles
set role = 'admin',
    updated_at = now()
where id in (
  select id
  from auth.users
  where lower(email) = lower('thekeeplilyco26@gmail.com')
);

-- Verify the result. Expected: exactly one row with role = 'admin'.
select u.email, p.role, p.full_name
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('thekeeplilyco26@gmail.com');
