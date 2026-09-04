export async function POST(){ return Response.json({verified:false,paid:false,error:'Server-side verification adapter is not configured.'},{status:503}); }
