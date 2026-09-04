import { env } from 'cloudflare:workers';

const createOrders = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  variants_json TEXT NOT NULL,
  personalisation_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  shipping_charge REAL,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  order_status TEXT NOT NULL,
  tracking_number TEXT,
  notes TEXT
)`;

export async function POST(request: Request) {
  const body = await request.json<Record<string, unknown>>();
  const required = ['customerName','email','phone','address','items'];
  if (required.some(key => !body[key]) || !Array.isArray(body.items) || body.items.length === 0) return Response.json({ error:'Missing required order details.' },{status:400});
  const now = new Date();
  const suffix = `${now.getUTCFullYear()}-${now.getTime().toString().slice(-6)}`;
  const orderId = `KEEP-${suffix}`;
  try {
    await env.DB.prepare(createOrders).run();
    await env.DB.prepare(`INSERT INTO orders (id,timestamp,customer_name,email,phone,address_json,items_json,variants_json,personalisation_json,subtotal,discount,shipping_charge,total,payment_method,payment_status,order_status,tracking_number,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(orderId,now.toISOString(),String(body.customerName),String(body.email),String(body.phone),JSON.stringify(body.address),JSON.stringify(body.items),JSON.stringify((body.items as Array<Record<string,unknown>>).map(i=>i.variant)),JSON.stringify((body.items as Array<Record<string,unknown>>).map(i=>i.personalisation)),Number(body.subtotal)||0,0,null,Number(body.total)||0,env.PAYMENT_PROVIDER||'not_configured','PENDING','RECEIVED',null,String(body.notes||'')).run();
    return Response.json({ orderId, paymentStatus:'PENDING', paid:false });
  } catch {
    return Response.json({ error:'Order storage is temporarily unavailable.' },{status:503});
  }
}
