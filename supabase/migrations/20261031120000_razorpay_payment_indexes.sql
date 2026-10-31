-- Razorpay checkout support. Existing orders/payments schema is preserved.
-- A single pending Razorpay attempt per store order prevents parallel duplicate attempts.
create unique index if not exists payments_one_pending_razorpay_per_order
  on public.payments(order_id)
  where provider = 'razorpay' and status = 'pending';

create unique index if not exists payments_provider_payment_id_unique
  on public.payments(provider_payment_id)
  where provider_payment_id is not null;
