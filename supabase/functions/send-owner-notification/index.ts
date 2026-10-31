import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EventType = "new_order" | "payment_succeeded" | "contact_message" | "custom_gift_request";

function equalSecret(actual: string, expected: string) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function text(value: unknown, limit = 2000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, limit);
}

function emailIsValid(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
  if (!webhookSecret) return new Response("Notification webhook is not configured", { status: 503 });
  const providedSecret = request.headers.get("x-notification-secret") ?? "";
  if (!equalSecret(providedSecret, webhookSecret)) return new Response("Unauthorized", { status: 401 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!resendKey || !emailIsValid(sender) || !supabaseUrl || !serviceKey ||
      Deno.env.get("OWNER_NOTIFICATION_EMAIL_CONFIRMED") !== "true") {
    return new Response("Email delivery is disabled until the owner address and provider are confirmed", { status: 503 });
  }

  let webhook: { type?: string; table?: string; schema?: string; record?: { id?: string } };
  try {
    webhook = await request.json();
  } catch {
    return new Response("Invalid webhook payload", { status: 400 });
  }
  const notificationId = webhook.record?.id ?? "";
  if (webhook.type !== "INSERT" || webhook.table !== "owner_notification_outbox" || webhook.schema !== "public" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
    return new Response("Invalid notification ID", { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: enabled, error: enabledError } = await admin.from("store_settings")
    .select("value").eq("key", "owner_notifications_enabled").maybeSingle();
  if (enabledError) return new Response("Notification settings could not be verified", { status: 503 });
  if (enabled?.value !== true) return new Response("Owner notifications are disabled", { status: 503 });

  const { data: recipientSetting, error: recipientError } = await admin.from("store_settings")
    .select("value").eq("key", "notification_email").maybeSingle();
  const recipient = typeof recipientSetting?.value === "string" ? recipientSetting.value : "";
  if (recipientError || !emailIsValid(recipient)) return new Response("A valid owner notification email is required", { status: 503 });

  const { data: claimed, error: claimError } = await admin.rpc("claim_owner_notification", {
    p_notification_id: notificationId,
  });
  if (claimError) return new Response("Notification could not be claimed", { status: 500 });
  const claim = Array.isArray(claimed) ? claimed[0] : null;
  if (!claim || !["new_order", "payment_succeeded", "contact_message", "custom_gift_request"].includes(claim.event_type)) {
    return new Response("Notification was already processed or is unavailable", { status: 409 });
  }

  let subject = "";
  let content = "";
  const sourceId = String(claim.source_id ?? "");
  const event = claim.event_type as EventType;

  if (event === "new_order") {
    const { data, error } = await admin.from("orders")
      .select("order_number,status,payment_status,grand_total,currency,guest_email,guest_phone")
      .eq("id", sourceId).maybeSingle();
    if (error || !data) {
      await admin.rpc("finish_owner_notification", { p_notification_id: notificationId, p_sent: false, p_error: "Order record unavailable" });
      return new Response("Order notification source could not be loaded", { status: 500 });
    }
    subject = "New store order: " + text(data.order_number, 80);
    content = [
      "A new order was placed.",
      "Order: " + text(data.order_number, 80),
      "Order status: " + text(data.status, 40),
      "Payment status: " + text(data.payment_status, 40),
      "Total: " + text(data.grand_total, 40) + " " + text(data.currency, 3),
      "Customer: " + text(data.guest_email || data.guest_phone, 254),
    ].join("\n");
  } else if (event === "payment_succeeded") {
    const { data, error } = await admin.from("payments")
      .select("provider_payment_id,amount,currency,status,orders(order_number)")
      .eq("id", sourceId).eq("status", "paid").maybeSingle();
    if (error || !data) {
      await admin.rpc("finish_owner_notification", { p_notification_id: notificationId, p_sent: false, p_error: "Verified payment record unavailable" });
      return new Response("Verified payment notification source could not be loaded", { status: 500 });
    }
    const order = Array.isArray(data.orders) ? data.orders[0] : data.orders;
    subject = "Payment verified for order: " + text(order?.order_number, 80);
    content = [
      "A payment was marked paid by the server-side verification flow.",
      "Order: " + text(order?.order_number, 80),
      "Amount: " + text(data.amount, 40) + " " + text(data.currency, 3),
      "Razorpay payment ID: " + text(data.provider_payment_id, 100),
    ].join("\n");
  } else if (event === "contact_message") {
    const { data, error } = await admin.from("contact_messages")
      .select("name,email,phone,subject,message").eq("id", sourceId).maybeSingle();
    if (error || !data) {
      await admin.rpc("finish_owner_notification", { p_notification_id: notificationId, p_sent: false, p_error: "Contact record unavailable" });
      return new Response("Contact notification source could not be loaded", { status: 500 });
    }
    subject = "New contact message";
    content = [
      "A customer sent a contact message.",
      "Name: " + text(data.name, 120),
      "Email: " + text(data.email, 254),
      "Phone: " + text(data.phone, 40),
      "Subject: " + text(data.subject, 180),
      "",
      text(data.message, 5000),
    ].join("\n");
  } else {
    const { data, error } = await admin.from("custom_gift_requests")
      .select("name,email,phone,occasion,gift_type,budget_min,budget_max,required_by,quantity,description")
      .eq("id", sourceId).maybeSingle();
    if (error || !data) {
      await admin.rpc("finish_owner_notification", { p_notification_id: notificationId, p_sent: false, p_error: "Gift request record unavailable" });
      return new Response("Gift notification source could not be loaded", { status: 500 });
    }
    subject = "New custom gift request";
    content = [
      "A new custom gift request was submitted.",
      "Name: " + text(data.name, 120),
      "Email: " + text(data.email, 254),
      "Phone: " + text(data.phone, 40),
      "Occasion: " + text(data.occasion, 120),
      "Gift type: " + text(data.gift_type, 120),
      "Budget: " + text(data.budget_min, 40) + "–" + text(data.budget_max, 40),
      "Required by: " + text(data.required_by, 40),
      "Quantity: " + text(data.quantity, 8),
      "",
      text(data.description, 7000),
    ].join("\n");
  }

  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + resendKey,
      "Content-Type": "application/json",
      "Idempotency-Key": notificationId,
    },
    body: JSON.stringify({ from: sender, to: [recipient], subject, text: content }),
  });
  if (!delivery.ok) {
    await admin.rpc("finish_owner_notification", {
      p_notification_id: notificationId,
      p_sent: false,
      p_error: "Email provider returned HTTP " + delivery.status,
    });
    return new Response("Email provider did not accept the notification", { status: 502 });
  }

  const { error: finishError } = await admin.rpc("finish_owner_notification", {
    p_notification_id: notificationId,
    p_sent: true,
    p_error: null,
  });
  if (finishError) return new Response("Email sent but notification status could not be saved", { status: 500 });
  return new Response("Notification sent", { status: 200 });
});
