# Razorpay Test Mode integration — TheKeeplily Co.

This branch adds Razorpay Standard Checkout to the existing Supabase-backed checkout. It preserves the current `create_customer_order` RPC, `orders` table, `payments` table, catalogue and inventory flow. It does not deploy to production or enable Live Mode.

## Flow

1. The signed-in customer submits the existing checkout form.
2. The `create_customer_order` RPC creates (or idempotently returns) an unpaid store order without changing stock.
3. `create-razorpay-order` authenticates the customer, loads their pending order from the database, calculates paise from the database total, creates a Razorpay order server-side and records its ID.
4. Razorpay Standard Checkout opens in the browser using only the public Test Key ID.
5. `verify-razorpay-payment` checks the HMAC signature against the stored Razorpay order ID, fetches the payment from Razorpay, checks captured status, amount, currency and order mapping, then calls the atomic database RPC. The RPC rechecks product availability and deducts stock only after capture; it records paid status and confirms the order in the same transaction.
6. If stock or product availability changed before capture was confirmed, payment is still recorded as paid, inventory is not decremented, and the order enters `payment_review`. The customer sees a support-review message and is told not to pay again.
7. The cart is cleared and the success page appears only after server verification.

A verified failed Razorpay attempt is recorded on its payment row; the store order remains pending, stock is unchanged, and a later retry can create another provider payment order. A dismissed checkout with no provider-verifiable payment ID remains pending. Retrying the form reuses the existing store-order idempotency key; it does not create a second store order.

## Required Supabase setup

Apply this migration in the existing Supabase project after the migrations already listed in `README-ECOMMERCE-SETUP.md`:

- `supabase/migrations/20261031115000_checkout_pricing_gate.sql`
- `supabase/migrations/20261031120000_razorpay_payment_indexes.sql`
- `supabase/migrations/20261031125000_add_payment_review_order_status.sql`
- `supabase/migrations/20261031130000_payment_inventory_atomic.sql`
- `supabase/migrations/20261031140000_admin_dashboard_fields.sql`
- `supabase/migrations/20261031150000_admin_services.sql`

It adds a uniqueness guard for one pending Razorpay attempt per order and a service-role-only SQL function that updates the payment and order atomically. Review existing data for duplicate pending Razorpay payment rows before applying the unique index; resolve any duplicates deliberately rather than deleting payment history.

The checkout pricing gate is reset to blocked by its migration. It must remain blocked until the owner approves shipping/tax treatment and the server-side order total reflects it. The current order RPC sets shipping and tax to zero, so it only charges the item subtotal; changing the approval flag alone does not add these amounts. New unpaid orders also require the admin store setting `store_status` to be `active`; this setting does not override the pricing approval gate.

## Configure Edge Function secrets

In Supabase Dashboard → Project → Edge Functions → Secrets, set:

- `RAZORPAY_KEY_ID` = the newly generated **Test Mode** Key ID
- `RAZORPAY_KEY_SECRET` = the newly generated **Test Mode** Secret
- `SITE_ORIGIN` = `https://thekeeplilyco.vercel.app`
- `SITE_ORIGINS` = the exact local origin used by this project, `http://127.0.0.1:8768` (add no other origin unless it is specifically needed)

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never put the Razorpay Secret or service-role key in browser code, GitHub, Vercel frontend variables, screenshots or chat. The previously exposed Secret must remain revoked and must not be reused.

Keep `SITE_ORIGIN` set to the production site. Add only the exact local origins needed to `SITE_ORIGINS`; do not use `*`. The local origins must also be allowed in Supabase Auth URL Configuration.

## Deploy Edge Functions

From the repository root, with the Supabase CLI linked to the correct project:

```sh
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
```

The functions require the normal Supabase JWT verification. Do not disable JWT verification.

## Test Mode checklist

1. Confirm the Test Key ID and matching newly rotated Test Secret are configured in Supabase Edge Function secrets.
2. Apply the migration and deploy both functions.
3. Sign in with a customer account, add an active product, and complete the checkout form.
4. Use Razorpay's official Test Mode payment credentials/instruments from its documentation; never use a real card or real funds for this test.
5. Confirm the browser returns to the success state only after the server confirms the payment is captured.
6. In Supabase, verify the matching `payments` row is `paid`, the matching `orders.payment_status` is `paid`, and the order status is `confirmed`.
7. Test a provider-verified failed payment and a dismissed/cancelled checkout. The order must remain unpaid, stock must remain unchanged, the cart must remain, and no success page must appear.
8. Test a tampered signature, wrong order ID and mismatched payment amount. Each must be rejected.
9. Confirm an unpaid, failed, or abandoned order leaves stock unchanged; a verified successful payment decrements it once; duplicate callbacks do not decrement again.
10. With two orders competing for the last unit, confirm only one can decrement stock. A captured payment that cannot be fulfilled must be recorded as `payment_review` without negative stock.

## Important limits / follow-up

- This integration is Test Mode only until the account is activated and Live API credentials are configured separately.
- No Razorpay webhook is configured in this repository. Browser callback verification is server-side; delayed/asynchronous events and reconciliation remain unverified. Configure and test a signed webhook before enabling Live Mode.
- The existing store currently has no configured shipping charge, tax, refund or abandoned-order restock policy. Those policies are unchanged by this payment integration.
- Do not merge this branch or deploy production until the owner has reviewed the changes and the Test Mode checklist passes.
