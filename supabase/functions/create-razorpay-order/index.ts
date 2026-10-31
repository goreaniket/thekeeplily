import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const defaultOrigin = Deno.env.get("SITE_ORIGIN") ?? "https://thekeeplilyco.vercel.app";
const allowedOrigins = new Set([
  defaultOrigin,
  ...(Deno.env.get("SITE_ORIGINS") ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : defaultOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return response(req, { error: "Payment provider is not configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response(req, { error: "Sign in is required" }, 401);
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return response(req, { error: "Invalid or expired session" }, 401);

  let body: { order_id?: string };
  try { body = await req.json(); } catch { return response(req, { error: "Invalid request body" }, 400); }
  if (!body.order_id || !/^[0-9a-f-]{36}$/i.test(body.order_id)) return response(req, { error: "A valid order ID is required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: order, error: orderError } = await admin.from("orders")
    .select("id, order_number, user_id, status, payment_status, grand_total, currency")
    .eq("id", body.order_id).eq("user_id", user.id).maybeSingle();
  if (orderError || !order) return response(req, { error: "Order not found" }, 404);
  if (order.status !== "pending_payment" || order.payment_status !== "pending") return response(req, { error: "This order is not awaiting payment" }, 409);
  if (order.currency !== "INR") return response(req, { error: "Only INR orders are supported" }, 400);

  const amount = Math.round(Number(order.grand_total) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) return response(req, { error: "Order amount must be at least ₹1.00" }, 400);

  const { data: previous } = await admin.from("payments").select("id, provider_order_id, amount, currency, status")
    .eq("order_id", order.id).eq("provider", "razorpay").eq("status", "pending").maybeSingle();

  let providerOrderId = previous?.provider_order_id ?? null;
  if (providerOrderId && (Math.round(Number(previous.amount) * 100) !== amount || previous.currency !== "INR")) {
    return response(req, { error: "Existing payment amount does not match the order" }, 409);
  }

  if (!providerOrderId) {
    const rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(keyId + ":" + keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount, currency: "INR", receipt: order.order_number, notes: { store_order_id: order.id, customer_id: user.id } }),
    });
    const rpBody = await rp.json().catch(() => ({}));
    if (!rp.ok || !rpBody.id) return response(req, { error: "Razorpay could not create the payment order", provider_status: rp.status }, 502);
    providerOrderId = rpBody.id;

    const { error: insertError } = await admin.from("payments").insert({
      order_id: order.id, provider: "razorpay", provider_order_id: providerOrderId,
      amount: Number(order.grand_total), currency: "INR", status: "pending",
      raw_response: { order_id: providerOrderId, receipt: order.order_number },
    });
    if (insertError) return response(req, { error: "Payment record could not be saved. Contact support before retrying." }, 500);
  }

  return response(req, { key_id: keyId, razorpay_order_id: providerOrderId, amount, currency: "INR", order_number: order.order_number });
});
