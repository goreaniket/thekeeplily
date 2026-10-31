import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") ?? "https://thekeeplilyco.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function hex(bytes: Uint8Array) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return response({ error: "Payment provider is not configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response({ error: "Sign in is required" }, 401);
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return response({ error: "Invalid or expired session" }, 401);

  let body: { order_id?: string; razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
  try { body = await req.json(); } catch { return response({ error: "Invalid request body" }, 400); }
  if (!body.order_id || !body.razorpay_payment_id || !body.razorpay_order_id || !body.razorpay_signature) {
    return response({ error: "Payment verification details are incomplete" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: order } = await admin.from("orders").select("id, user_id, status, payment_status, grand_total, currency")
    .eq("id", body.order_id).eq("user_id", user.id).maybeSingle();
  if (!order) return response({ error: "Order not found" }, 404);

  const { data: payment } = await admin.from("payments").select("id, provider_order_id, amount, currency, status")
    .eq("order_id", order.id).eq("provider", "razorpay").eq("provider_order_id", body.razorpay_order_id).maybeSingle();
  if (!payment) return response({ error: "Payment order does not match this store order" }, 409);

  const expected = await hmac(payment.provider_order_id + "|" + body.razorpay_payment_id, keySecret);
  if (!constantTimeEqual(expected, body.razorpay_signature)) return response({ error: "Payment signature verification failed" }, 400);

  const rp = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(body.razorpay_payment_id), {
    headers: { "Authorization": "Basic " + btoa(keyId + ":" + keySecret) },
  });
  const rpPayment = await rp.json().catch(() => ({}));
  if (!rp.ok) return response({ error: "Could not confirm payment with Razorpay" }, 502);

  const expectedAmount = Math.round(Number(order.grand_total) * 100);
  if (rpPayment.order_id !== payment.provider_order_id || rpPayment.amount !== expectedAmount ||
      rpPayment.currency !== "INR" || rpPayment.status !== "captured") {
    return response({ error: "Razorpay payment is not captured for the expected amount and order" }, 409);
  }

  if (order.payment_status === "paid" && payment.status === "paid") {
    return response({ verified: true, already_verified: true, order_id: order.id });
  }
  if (order.payment_status !== "pending" || order.status !== "pending_payment") {
    return response({ error: "Store order is no longer awaiting payment" }, 409);
  }

  const { data: confirmed, error: confirmError } = await admin.rpc("confirm_razorpay_payment", {
    p_payment_id: payment.id,
    p_order_id: order.id,
    p_provider_payment_id: body.razorpay_payment_id,
    p_signature: body.razorpay_signature,
    p_raw_response: rpPayment,
  });
  if (confirmError || confirmed !== true) {
    return response({ error: "Payment was captured but order confirmation needs support review. Keep your payment ID for reference." }, 500);
  }

  return response({ verified: true, order_id: order.id, payment_id: body.razorpay_payment_id });
});
