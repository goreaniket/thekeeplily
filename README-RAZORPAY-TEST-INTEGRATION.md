# Razorpay Test Mode integration — TheKeeplily Co.

This branch adds Razorpay Standard Checkout to the existing Supabase-backed checkout. It preserves the current `create_customer_order` RPC, `orders` table, `payments` table, catalogue and inventory flow. It does not deploy to production or enable Live Mode.

## Flow

1. The signed-in customer submits the existing checkout form.
2. The existing `create_customer_order` RPC creates (or idempotently returns) the store order and deducts tracked stock once.
3. `create-razorpay-order` authenticates the customer, loads their pending order from the database, calculates paise from the database total, creates a Razorpay order server-side and records its ID.
4. Razorpay Standard Checkout opens in the browser using only the public Test Key ID.
5. `verify-razorpay-payment` checks the HMAC signature against the stored Razorpay order ID, fetches the payment from Razorpay, checks captured status, amount, currency and order mapping, then calls the atomic database RPC to mark both payment and store order paid.
6. The cart is cleared and the success page appears only after server verification.

A closed or failed checkout leaves the order pending and retains the cart. Retrying the form reuses the existing order request idempotency key; it does not create a second store order.

## Required Supabase setup

Apply this migration in the existing Supabase project after the migrations already listed in `README-ECOMMERCE-SETUP.md`:

- `supabase/migrations/20261031120000_razorpay_payment_indexes.sql`

It adds a uniqueness guard for one pending Razorpay attempt per order and a service-role-only SQL function that updates the payment and order atomically. Review existing data for duplicate pending Razorpay payment rows before applying the unique index; resolve any duplicates deliberately rather than deleting payment history.

## Configure Edge Function secrets

In Supabase Dashboard → Project → Edge Functions → Secrets, set:

- `RAZORPAY_KEY_ID` = the newly generated **Test Mode** Key ID
- `RAZORPAY_KEY_SECRET` = the newly generated **Test Mode** Secret
- `SITE_ORIGIN` = `https://thekeeplilyco.vercel.app`

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never put the Razorpay Secret or service-role key in browser code, GitHub, Vercel frontend variables, screenshots or chat. The previously exposed Secret must remain revoked and must not be reused.

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
7. Test a failed/cancelled payment. The order must remain pending, the cart must remain, and no success page must appear.
8. Test a tampered signature, wrong order ID and mismatched payment amount. Each must be rejected.
9. Confirm the stock count was reduced once when the order was created, not again when payment was verified.

## Important limits / follow-up

- This integration is Test Mode only until the account is activated and Live API credentials are configured separately.
- No webhook is included in this first pass. Browser callback verification is server-side, but a production-grade deployment should add a signed Razorpay webhook for delayed/asynchronous payment events and reconciliation before enabling Live Mode.
- The existing store currently has no configured shipping charge, tax, refund or abandoned-order restock policy. Those policies are unchanged by this payment integration.
- Do not merge this branch or deploy production until the owner has reviewed the changes and the Test Mode checklist passes.
