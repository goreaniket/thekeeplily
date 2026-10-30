-- Restrict table privileges and policies to the intended public and account
-- access paths. Run after the baseline, contact, and backend migrations.
begin;

do $$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array[
    'profiles',
    'categories',
    'products',
    'product_images',
    'customer_addresses',
    'wishlist_items',
    'orders',
    'order_items',
    'payments',
    'shipments',
    'custom_gift_requests',
    'coupons',
    'newsletter_subscribers',
    'store_settings',
    'invoice_sequences',
    'customers',
    'inventory_transactions',
    'contact_messages'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable row level security', v_table);
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;
    execute format('revoke all privileges on table public.%I from public, anon', v_table);
  end loop;
end;
$$;

grant select on public.categories, public.products, public.product_images to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images to authenticated;

grant select, update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses, public.wishlist_items to authenticated;
grant select, update (marketing_consent) on public.customers to authenticated;
grant select on public.orders, public.order_items, public.payments, public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;
grant select, update on public.custom_gift_requests to authenticated;
grant select, insert, update, delete on public.coupons, public.newsletter_subscribers,
  public.contact_messages, public.store_settings, public.invoice_sequences to authenticated;

create policy "Active categories are public"
  on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "Admins manage categories"
  on public.categories for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Active products are public"
  on public.products for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy "Admins manage products"
  on public.products for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Product images follow product visibility"
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_id
        and (p.status = 'active' or (select public.is_admin()))
    )
  );
create policy "Admins manage product images"
  on public.product_images for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Profiles read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Profiles update own or admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy "Customers manage own addresses"
  on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Customers manage own wishlist"
  on public.wishlist_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Customers read own customer record"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Customers update own marketing preference"
  on public.customers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Customers and admins read orders"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Customers and admins read order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and (o.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );
create policy "Admins read payments"
  on public.payments for select to authenticated
  using ((select public.is_admin()));
create policy "Admins manage shipments"
  on public.shipments for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage custom gift requests"
  on public.custom_gift_requests for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Customers read own custom gift requests"
  on public.custom_gift_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Admins manage coupons"
  on public.coupons for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins manage newsletter"
  on public.newsletter_subscribers for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins manage contact messages"
  on public.contact_messages for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins manage store settings"
  on public.store_settings for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins manage invoice sequences"
  on public.invoice_sequences for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins read inventory transactions"
  on public.inventory_transactions for select to authenticated
  using ((select public.is_admin()));

commit;
