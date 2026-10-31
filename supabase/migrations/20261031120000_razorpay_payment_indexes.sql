-- Razorpay checkout support. Existing orders/payments schema is preserved.
-- A single pending Razorpay attempt per store order prevents parallel duplicate attempts.
create unique index if not exists payments_one_pending_razorpay_per_order
  on public.payments(order_id)
  where provider = 'razorpay' and status = 'pending';

create unique index if not exists payments_provider_payment_id_unique
  on public.payments(provider_payment_id)
  where provider_payment_id is not null;


-- Update payment and order together; the Edge Function calls this with service-role credentials.
create or replace function public.confirm_razorpay_payment(
  p_payment_id uuid,
  p_order_id uuid,
  p_provider_payment_id text,
  p_signature text,
  p_raw_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_payment from public.payments
  where id = p_payment_id and order_id = p_order_id and provider = 'razorpay'
  for update;
  if not found then raise exception 'Payment record not found'; end if;

  if v_order.payment_status = 'paid' and v_payment.status = 'paid'
     and v_payment.provider_payment_id = p_provider_payment_id then
    return true;
  end if;

  if v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment'
     or v_payment.status <> 'pending' then
    raise exception 'Order is no longer awaiting payment';
  end if;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      provider_signature = p_signature,
      status = 'paid',
      paid_at = now(),
      raw_response = coalesce(p_raw_response, '{}'::jsonb),
      updated_at = now()
  where id = p_payment_id;

  update public.orders
  set payment_status = 'paid', status = 'confirmed', updated_at = now()
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.confirm_razorpay_payment(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_razorpay_payment(uuid, uuid, text, text, jsonb) to service_role;
