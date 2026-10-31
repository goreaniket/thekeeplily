# TheKeeplily Co. — Supabase and backend setup

The storefront remains plain HTML, CSS and JavaScript. This branch adds a Supabase-backed catalogue, customer accounts, public request forms, an authenticated admin panel, an order foundation, and Razorpay Test Mode integration source. Checkout remains disabled by the database pricing gate until the owner-approved shipping and tax rules are implemented; no payment is claimed as tested or live. Delhivery is not integrated.

## Supabase configuration

1. Use the Supabase project owned by TheKeeplily Co.
2. In **Project Settings → API**, copy the project URL and the publishable (or legacy anon) key into `js/supabase-config.js`.
3. Only the URL and publishable/anon key belong in browser code. Never put a service-role key, database password, payment secret, courier token, or other private credential in the repository or a browser-exposed environment variable.
4. In **Authentication → URL Configuration**, set the site URL and allow the deployed `/account.html` callback URLs, including `?mode=update` for password recovery and `?return=checkout.html` for signup started from checkout. If testing locally, allow the exact localhost account URL too; `file://` pages cannot authenticate.

The publishable key is intentionally public; Row Level Security and narrowly granted RPCs are the security boundary.

## Database setup and migration order

For the blank, schema-matched product import templates and verified category lookup, see [`README-CATALOGUE-IMPORT.md`](./README-CATALOGUE-IMPORT.md). The templates intentionally contain no product data.

For a **new Supabase project**, run these files in the SQL Editor in order:

1. `supabase/schema.sql` — baseline schema and initial RLS/storage policies. This is a one-time bootstrap file, not a repeatable migration; do not rerun it on a populated project.
2. `supabase/migrations/20261030_contact_messages.sql` — contact inbox table and initial policies.
3. `supabase/migrations/20261030110000_backend_foundation.sql` — additive customer records, inventory audit log, public form RPCs, and secure order/status RPCs. This migration is designed to be safe to run again.
4. `supabase/migrations/20261030212100_rls_access_hardening.sql` — rebuilds table policies and grants so only active catalogue data is public and private records cannot be read with the anon key. Run after the backend migration.
5. `supabase/migrations/20261031115000_checkout_pricing_gate.sql` — blocks checkout and pending-order creation until the owner approves the delivery/tax treatment and the server-side total matches it. The setting defaults to false.
6. `supabase/migrations/20261031120000_razorpay_payment_indexes.sql` — adds payment uniqueness guards and the service-role-only payment confirmation RPC.
7. `supabase/migrations/20261031125000_add_payment_review_order_status.sql` — adds a visible review state for a captured payment that cannot safely be fulfilled.
8. `supabase/migrations/20261031130000_payment_inventory_atomic.sql` — restores prior unpaid-order deductions once, keeps new unpaid orders from changing stock, and deducts tracked stock atomically only after verified payment.
9. `supabase/migrations/20261031140000_admin_dashboard_fields.sql` — adds order notes, custom-gift quote fields, idempotent/rate-limited contact submission, and the admin-only order-notes RPC.

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
3. Sign-in supports the existing email/password flow and a one-time email code for existing accounts. The OTP path uses Supabase `signInWithOtp` with account creation disabled, verifies with `verifyOtp`, and applies a 60-second resend cooldown. Password reset uses the same page with a secure recovery link.
4. For OTP messages to contain a copyable code, configure Supabase Auth email delivery/SMTP and the email template to include `{{ .Token }}`. Public Auth settings confirm email authentication is enabled and confirmation is required, but do not disclose SMTP delivery or template configuration. OTP sign-in requires the account to already exist; public code login does not create accounts or grant roles.
5. Profiles, marketing preference, addresses, order history and owned custom-gift requests are restricted by RLS to the signed-in user. Expired or missing sessions cannot access customer order data.

Customers may create unpaid orders only after signing in and after the checkout pricing gate is approved. The order RPC locks product rows, validates active products/options and current database prices, checks aggregate stock, and writes the order/items without changing inventory. Only the server-side payment confirmation RPC may deduct tracked stock, after Razorpay capture, amount, currency, order mapping, and signature have been verified. It locks product rows, rechecks availability, and records stock changes atomically. Duplicate callbacks do not deduct twice. If a captured payment can no longer be fulfilled safely, the payment is recorded as paid, stock is left unchanged, and the order enters `payment_review` for an administrator; the customer is told not to pay again.

Unpaid, failed, cancelled, and abandoned orders do not change stock. No temporary reservation is used. Cancelled or refunded paid orders do not automatically restore inventory; an authorized administrator must make any approved adjustment, which is audit-logged. No shipping charge or GST treatment is configured. The order RPC currently sets shipping and tax to zero, so its grand total is only the item subtotal. Do not enable payments until the owner/CA policies are approved and server-side totals implement them.

The checkout pricing gate migration deliberately resets `store_settings.checkout_pricing_approved` to `false` and installs a database trigger that rejects pending orders while it is false. Keep it false until approved shipping/tax rules are implemented in the server-side total calculation; changing the flag alone does not add shipping or tax.

## Store owner admin setup

1. First create or invite the owner's account through Supabase Auth using `thekeeplilyco26@gmail.com`.
2. The owner must accept the invitation/confirm the email before promotion.
3. After the schema is installed, open **SQL Editor** and run `supabase/setup-store-owner-admin.sql`.
4. The script promotes only the one confirmed Auth user whose email exactly matches the intended owner email. It fails unless exactly one confirmed account and its profile exist. Verify the returned email and `admin` role.

This SQL must be run manually in the Supabase dashboard. It does not create an account, password, or public admin-registration path. Role changes are blocked for browser sessions, and both the admin UI and database policies verify the signed-in user's profile role server-side.

The admin portal is at `/admin/`. It verifies the signed-in profile role with Supabase before showing admin features. The customer account page only shows its admin link when the signed-in profile already has the admin role; RLS and admin-only RPCs remain the access boundary. The portal supports paid-only revenue, order lifecycle counts, customers and paid-order spending, product/category editing and image upload, searchable/filterable order details and internal notes, read-only verified payment records, shipment status/tracking edits, custom-gift quotes and notes, contact status/notes, newsletter search/status/CSV export, and a read-only view of configured non-secret store settings. Low-stock counts require an explicitly configured `low_stock_threshold`. It never exposes payment signatures or changes payment status manually.

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

- public live-catalogue load, safe empty/error states, and no demo-product fallback;
- account sign-up, confirmation, sign-in/out and password reset;
- profile/address isolation and customer order history;
- contact, newsletter and custom-gift submission;
- contact-message idempotency/rate-limit behavior and OTP code delivery/verification using the configured Supabase email template;
- checkout rejects anonymous access and creates only unpaid orders;
- checkout remains blocked until its pricing approval setting is enabled after the final total is configured;
- replaying one idempotency key does not create a second order or stock deduction;
- customer requests cannot read another customer's records or change order/payment fields;
- non-admin users cannot enter `/admin/`, while the promoted owner can manage products, requests and order status.

Supabase SQL Editor/database access is required to validate SQL execution and RLS behavior against a real project. No hosted database execution is implied by these local files.

## Remaining manual steps

- Configure the project URL/publishable key, Auth redirect allowlist, SMTP delivery, and OTP email template.
- Check migration history in the Supabase dashboard; run the missing migrations in the order above.
- Create/confirm the owner Auth account and run the owner-promotion SQL.
- Exercise database/RLS/auth flows against that project.
- Decide shipping/tax/cancellation/restock policies before accepting payments or treating order totals as final.
- Razorpay is configured for Test Mode only. Delhivery integration and owner email notifications are not configured. Apply the latest migration before using order notes or custom-gift quotation fields.


## Razorpay checkout integration

The first Test Mode implementation is documented separately in `README-RAZORPAY-TEST-INTEGRATION.md`. It uses the existing orders/payments schema and adds two Supabase Edge Functions. Apply the checkout pricing gate and `supabase/migrations/20261031120000_razorpay_payment_indexes.sql`, configure the Razorpay Test credentials only as Supabase Edge Function secrets, deploy both functions, and complete the documented Test Mode checklist before considering a production merge. No Live Mode credentials or production deployment are included.
