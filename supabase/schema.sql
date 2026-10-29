-- TheKeeplily Co. — Supabase production foundation
-- Run in Supabase SQL Editor on a new project. Review business/tax fields with the owner/CA before launch.

create extension if not exists pgcrypto;

create type public.account_role as enum ('customer', 'admin');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('pending_payment', 'confirmed', 'preparing', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded');
create type public.shipment_status as enum ('pending', 'ready_to_ship', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'rto_initiated', 'rto_delivered', 'cancelled');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.account_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A customer must never be able to promote their own account to admin.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Account role cannot be changed by the account owner';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_role_escalation();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  sku text unique,
  slug text not null unique,
  name text not null,
  short_description text,
  description text,
  price numeric(12,2) not null check (price >= 0),
  sale_price numeric(12,2) check (sale_price is null or (sale_price >= 0 and sale_price <= price)),
  currency char(3) not null default 'INR',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  track_inventory boolean not null default true,
  allow_backorder boolean not null default false,
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  is_bestseller boolean not null default false,
  is_new_arrival boolean not null default false,
  is_customisable boolean not null default false,
  customisation_charge numeric(12,2) not null default 0 check (customisation_charge >= 0),
  variants jsonb not null default '[]'::jsonb,
  materials text,
  dimensions text,
  weight_grams integer check (weight_grams is null or weight_grams > 0),
  preparation_days integer check (preparation_days is null or preparation_days >= 0),
  care_instructions text,
  tags text[] not null default '{}',
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_active_category_idx on public.products(category_id, created_at desc) where status = 'active';
create index products_active_created_idx on public.products(created_at desc) where status = 'active';

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id, sort_order);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text default 'Home',
  full_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  landmark text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses(user_id);

create table public.wishlist_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  guest_email text,
  guest_phone text,
  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',
  currency char(3) not null default 'INR',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  grand_total numeric(12,2) not null check (grand_total >= 0),
  coupon_code text,
  customer_note text,
  billing_address jsonb not null,
  shipping_address jsonb not null,
  invoice_number text unique,
  invoice_storage_path text,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku_snapshot text,
  name_snapshot text not null,
  image_snapshot text,
  variant_snapshot text,
  personalisation text,
  gift_message text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  provider_signature text,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'delhivery',
  provider_shipment_id text,
  awb_number text unique,
  pickup_location text,
  weight_grams integer,
  length_cm numeric(8,2),
  width_cm numeric(8,2),
  height_cm numeric(8,2),
  shipping_cost numeric(12,2),
  status public.shipment_status not null default 'pending',
  tracking_url text,
  label_storage_path text,
  pickup_scheduled_at timestamptz,
  picked_up_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  last_scan_at timestamptz,
  last_scan_location text,
  last_scan_description text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id);
create index shipments_status_idx on public.shipments(status, updated_at desc);

create table public.custom_gift_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  occasion text,
  gift_type text,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  required_by date,
  quantity integer not null default 1 check (quantity > 0),
  preferred_colours text,
  description text not null,
  gift_message text,
  reference_storage_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','reviewing','quoted','accepted','in_production','completed','declined')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_gift_requests_created_idx on public.custom_gift_requests(created_at desc);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed','percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) not null default 0,
  maximum_discount numeric(12,2),
  usage_limit integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.store_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.invoice_sequences (
  financial_year text primary key,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

-- Keep timestamps consistent.
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','products','customer_addresses','orders','payments','shipments','custom_gift_requests','store_settings','invoice_sequences'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.custom_gift_requests enable row level security;
alter table public.coupons enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.store_settings enable row level security;
alter table public.invoice_sequences enable row level security;

create policy "Profiles: read own or admin" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Profiles: update own or admin" on public.profiles for update to authenticated using (id = (select auth.uid()) or (select public.is_admin())) with check (id = (select auth.uid()) or (select public.is_admin()));

create policy "Active categories are public" on public.categories for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "Admins manage categories" on public.categories for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Active products are public" on public.products for select to anon, authenticated using (status = 'active' or (select public.is_admin()));
create policy "Admins manage products" on public.products for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Product images follow product visibility" on public.product_images for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (p.status = 'active' or (select public.is_admin())))
);
create policy "Admins manage product images" on public.product_images for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Customers manage own addresses" on public.customer_addresses for all to authenticated using (user_id = (select auth.uid()) or (select public.is_admin())) with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Customers manage own wishlist" on public.wishlist_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Customers read own orders" on public.orders for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins manage orders" on public.orders for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Customers read own order items" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.is_admin())))
);
create policy "Admins manage order items" on public.order_items for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admins read payments" on public.payments for select to authenticated using ((select public.is_admin()));
create policy "Admins read shipments" on public.shipments for select to authenticated using ((select public.is_admin()));
create policy "Admins manage shipments" on public.shipments for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admins manage custom gift requests" on public.custom_gift_requests for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Customers read own custom gift requests" on public.custom_gift_requests for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins manage coupons" on public.coupons for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Active coupons can be validated" on public.coupons for select to anon, authenticated using (is_active);
create policy "Admins manage newsletter" on public.newsletter_subscribers for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins read store settings" on public.store_settings for select to authenticated using ((select public.is_admin()));
create policy "Admins manage store settings" on public.store_settings for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins manage invoice sequences" on public.invoice_sequences for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Public forms are intentionally limited to inserting their own submitted data.
create policy "Public can submit custom gift requests" on public.custom_gift_requests for insert to anon, authenticated with check (
  status = 'new' and user_id is null
);
create policy "Public can subscribe to newsletter" on public.newsletter_subscribers for insert to anon, authenticated with check (is_active = true);

-- Storage buckets: product imagery is public; customer uploads and invoices are private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('custom-gift-uploads', 'custom-gift-uploads', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('order-documents', 'order-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "Public can view product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and (select public.is_admin())) with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and (select public.is_admin()));

create policy "Admins manage order documents" on storage.objects for all to authenticated using (bucket_id = 'order-documents' and (select public.is_admin())) with check (bucket_id = 'order-documents' and (select public.is_admin()));

-- Do not expose the service-role key in browser code. Order creation, payment verification,
-- stock deduction, invoice numbering and courier API calls must run in trusted Edge Functions.
