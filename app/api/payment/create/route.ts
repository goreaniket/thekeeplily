import { env } from 'cloudflare:workers';
export async function POST(){
  const provider=env.PAYMENT_PROVIDER;
  const configured=provider==='razorpay'?Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET):provider==='cashfree'?Boolean(env.CASHFREE_APP_ID&&env.CASHFREE_SECRET_KEY):false;
  if(!configured)return Response.json({error:'Online payment is not configured. No charge was attempted.'},{status:503});
  return Response.json({error:'The merchant payment adapter must be activated after account approval. No charge was attempted.'},{status:501});
}
