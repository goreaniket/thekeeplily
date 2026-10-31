# TheKeeplily Co. — Supabase and backend setup

The storefront remains plain HTML, CSS and JavaScript. This branch adds a Supabase-backed catalogue, customer accounts, public request forms, an authenticated admin panel, and an unpaid order foundation. It does not integrate Razorpay or Delhivery.

## Supabase configuration

1. Use the Supabase project owned by TheKeeplily Co.
2. In **Project Settings → API**, copy the project URL and the publishable (or legacy anon) key into `js/supabase-config.js`.
3. Only the URL and publishable/anon key belong in browser code. Never put a service-role key, database password, payment secret, courier token, or other private credential in the repository or a browser-exposed environment variable.
4. In **Authentication → URL Configuration**, set the site URL and allow the deployed `/account.html` URL as a redirect. Password recovery and signup confirmation use that page.

The publishable key is intentionally public; Row Level Security and narrowly granted RPCs are the security boundary.

## Database setup and migration order

For a **new Supabase project**, run these files in the SQL Editor in order:

1. `supabase/schema.sql` — baseline schema and initial RLS/storage policies. This is a one-time bootstrap file, not a repeatable migration; do not rerun it on a populated project.
2. `supabase/migrations/20261030_contact_messages.sql` — contact inbox table and initial policies.
3. `supabase/migrations/20261030110000_backend_foundation.sql` — additive customer records, inventory audit log, public form RPCs, and secure order/status RPCs. This migration is designed to be safe to run again.
4. `supabase/migrations/20261030212100_rls_access_hardening.sql` — rebuilds table policies and grants so only active catalogue data is public and private records cannot be read with the anon key. Run after the backend migration.

The repository cannot show whether `20261030_contact_messages.sql` has already been executed in the hosted database. This must be checked in the Supabase dashboard. If its table and policies already exist, the file is safe to run again: it uses `CREATE TABLE IF NOT EXISTS` and replaces its named policies/trigger. Do not treat a file existing locally as proof that a migration ran.

For a project with existing data, take a backup and inspect the hosted schema before applying the baseline. Apply only the migrations that are missing, in order; the backend migration requires the tables and `public.is_admin()` from the baseline plus `contact_messages` from the contact migration.

The backend migration adds:

- `customers` linked to Auth-created `profiles`; auth triggers maintain the email snapshot.
- `inventory_transactions` and an audit trigger for admin stock edits.
- An idempotency key on orders.
- Validated RPC endpoints for newsletter, contact, custom-gift, order creation, and admin order-status changes.
- Write restrictions that prevent browser clients from editing order totals/status or payment records.

The access-hardening migration removes existing policies on the affected tables before recreating the intended policies. It also removes direct anon table grants from private records and removes public coupon reads; public form writes continue through their validated RPCs.

## Customer accounts

1. Visit `/account.html` and create an account, or create/invite a user through **Authentication → Users**.
2. Complete email confirmation if enabled for the project.
3. Sign-in sessions use the Supabase browser SDK's persisted session. Password reset uses the same page with a secure recovery link.
4. Profiles, marketing preference, addresses, order history and owned custom-gift requests are restricted by RLS to the signed-in user. Expired or missing sessions cannot access customer order data.

Customers may create unpaid orders only after signing in. The order RPC locks product rows, validates active products/options and current database prices, checks aggregate stock, writes the order/items, deducts tracked stock, and records inventory changes in one transaction. Repeating the same request key returns the existing order instead of decrementing stock twice.

No shipping charge, tax, payment, refund or delivery policy is configured. Checkout labels the current total as excluding shipping and leaves payment pending; it does not mark an order paid. Tracked stock is deducted when the unpaid order is created. There is intentionally no automatic expiry/restock policy for abandoned or cancelled orders; review unpaid orders and adjust stock deliberately from the admin product editor until the owner sets that policy.

## Store owner admin setup

1. First create or invite the owner's account through Supabase Auth using `thekeeplilyco26@gmail.com`.
2. The owner must accept the invitation/confirm the email before promotion.
3. After the schema is installed, open **SQL Editor** and run `supabase/setup-store-owner-admin.sql`.
4. The script promotes only the one confirmed Auth user whose email exactly matches the intended owner email. It fails unless exactly one confirmed account and its profile exist. Verify the returned email and `admin` role.

This SQL must be run manually in the Supabase dashboard. It does not create an account, password, or public admin-registration path. Role changes are blocked for browser sessions, and both the admin UI and database policies verify the signed-in user's profile role server-side.

The admin portal is at `/admin/`. It supports admin sign-in, overview counts, product create/edit and image upload, order listing/status changes, custom-gift request management, and the contact inbox. Payment status is read-only and cannot be changed from the browser.

## RLS and form security

- Anonymous/authenticated catalogue reads are limited to active products and active categories; product image reads follow product visibility.
- The access-hardening migration explicitly revokes anon access to customer, order, payment, shipment, form-submission, inventory, and configuration tables.
- Profile/address/customer/order/order-item reads and updates are scoped to the signed-in user's own records. Role and payment fields are not customer-editable.
- Orders, order items, inventory transactions and payment records cannot be written directly by browser roles. Order totals/prices/stock come from the server-side database function.
- Public contact, newsletter and custom-gift submissions use validation RPCs, length/type constraints, and a honeypot field. Private submissions are not publicly readable. Newsletter duplicates return a successful already-subscribed result.
- Admin content is rendered with HTML escaping. The browser never has a service-role key.
- Honeypots and database validation help with invalid/spam submissions but are not a substitute for an edge/WAF rate limiter.

## Local checks

There is no package manifest or committed test runner in this static-site repository. From the repository root, run JavaScript syntax checks if Node.js is installed:

```powershell
Get-ChildItem .\js\*.js, .\admin\*.js -ErrorAction SilentlyContinue | ForEach-Object { node --check $_.FullName }
```

Serve the repository with a local static HTTP server (rather than `file://`) and verify:

- public catalogue load and preview fallback;
- account sign-up, confirmation, sign-in/out and password reset;
- profile/address isolation and customer order history;
- contact, newsletter and custom-gift submission;
- checkout rejects anonymous access and creates only unpaid orders;
- replaying one idempotency key does not create a second order or stock deduction;
- customer requests cannot read another customer's records or change order/payment fields;
- non-admin users cannot enter `/admin/`, while the promoted owner can manage products, requests and order status.

Supabase SQL Editor/database access is required to validate SQL execution and RLS behavior against a real project. No hosted database execution is implied by these local files.

## Remaining manual steps

- Configure the project URL/publishable key and Auth redirect allowlist.
- Check migration history in the Supabase dashboard; run the missing migrations in the order above.
- Create/confirm the owner Auth account and run the owner-promotion SQL.
- Exercise database/RLS/auth flows against that project.
- Decide shipping/tax/payment/cancellation/restock policies before accepting real payments or treating order totals as final.
- Razorpay, Delhivery, transactional email and production deployment are not implemented here.


## Razorpay checkout integration

The first Test Mode implementation is documented separately in `README-RAZORPAY-TEST-INTEGRATION.md`. It uses the existing orders/payments schema and adds two Supabase Edge Functions. Apply `supabase/migrations/20261031120000_razorpay_payment_indexes.sql`, configure the Razorpay Test credentials only as Supabase Edge Function secrets, deploy both functions, and complete the documented Test Mode checklist before considering a production merge. No Live Mode credentials or production deployment are included.
