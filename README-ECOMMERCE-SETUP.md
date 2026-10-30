# TheKeeplily Co. — storefront foundation

This repository uses plain HTML, CSS and JavaScript. It is not a Next.js project.

## Current branch

The ecommerce foundation is being prepared on `build/ecommerce-foundation`. The live `main` branch is not changed by this work.

## What this branch adds

- A Supabase database schema for products, categories, customer profiles, addresses, wishlists, orders, order items, payments, shipments, custom-gift requests, coupons, newsletter subscribers, store settings and invoice numbering.
- Row-level security policies and private storage buckets.
- A private admin portal at `/admin/` with admin-only sign-in, product creation/editing with image upload, read views for orders and custom-gift requests, and a contact-message inbox.
- Supabase-backed public submissions for custom-gift requests, newsletter subscriptions and contact messages. Contact messages require the additional migration below.
- A live catalogue loader: when Supabase is configured, active products/categories are read from Supabase; otherwise the existing local preview catalogue is used.

## Setup required before the live catalogue/admin can work

1. Create a Supabase project owned by TheKeeplily Co.
2. Open **SQL Editor** and run the complete `supabase/schema.sql` file.
3. Run `supabase/migrations/20261030_contact_messages.sql` in SQL Editor to create the contact-message inbox table and its RLS policies.
4. In Supabase **Project Settings → API Keys**, copy the Project URL and the publishable/anon public key.
5. Put those two public values in `js/supabase-config.js`:
   - `url`: Supabase Project URL
   - `anonKey`: publishable/anon public key
6. Create the owner's login in **Authentication → Users**. Do not add public admin sign-up.
7. In SQL Editor, run `supabase/setup-store-owner-admin.sql` to promote the confirmed owner account after it exists. The file targets `thekeeplilyco26@gmail.com`; do not run it before creating the Auth user.

   The equivalent manual SQL is:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id from auth.users
     where email = 'OWNER_LOGIN_EMAIL'
   );
   ```
   Replace the placeholder with the owner's exact login email. Run this only after the user exists.
8. Deploy the repository branch to a Vercel preview and test `/admin/`, contact/custom-gift/newsletter submissions and the public catalogue.

## Security rules

- The Supabase anon/publishable key is intended for browser use; Row Level Security is the security boundary.
- **Never** put a Supabase service-role key, Razorpay secret, Delhivery token, Resend API key, or any other private key in HTML, CSS, JavaScript, GitHub, or browser-exposed Vercel variables.
- Order creation, stock reservation/deduction, Razorpay order creation and signature verification, invoice numbering/PDF creation, and Delhivery shipment/pickup/tracking calls must be implemented as trusted Supabase Edge Functions (or another trusted server). The browser must never mark an order paid by itself.
- Do not enable real payments or advertise checkout as live until server-side Razorpay verification and failure handling are deployed and tested.
- Do not automatically schedule a courier pickup until the owner marks a parcel packed/ready to ship.

## Not yet connected

The repository does not contain business credentials, so this branch does not claim these integrations are live:
- Razorpay checkout and webhook/signature verification
- Delhivery serviceability, rate quote, shipment, pickup, label and tracking APIs
- Transactional email delivery (forms are stored in Supabase; email notifications are not yet enabled)
- Customer self-service account/order pages and guest checkout submission
- Invoice PDF generation and tax/HSN configuration

These require the owner's provider accounts, API credentials, confirmed business/tax details and server-side functions. The current checkout page remains a preview until that work is completed.

## Admin portal

After Supabase setup and owner promotion, open:

`https://YOUR-DOMAIN/admin/`

Only a signed-in profile with `role = 'admin'` can use the admin portal. Customer accounts cannot change their own role through the profile update policy/trigger.

## Deployment

Vercel should deploy the `build/ecommerce-foundation` branch as a Preview first. Test desktop and mobile, product listing, product detail, cart, and admin access before merging into `main` and assigning the production domain.
