import { env } from 'cloudflare:workers';
import { localCatalogue } from '@/lib/catalog';

export async function GET() {
  if (!env.GOOGLE_SHEETS_API_URL) return Response.json({ products: localCatalogue, source: 'local-fallback' });
  try {
    const response = await fetch(env.GOOGLE_SHEETS_API_URL, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 120 } });
    if (!response.ok) throw new Error('Catalogue source unavailable');
    const data = await response.json() as { products?: unknown } | unknown[];
    return Response.json({ products: Array.isArray(data) ? data : data.products ?? [], source: 'google-sheets' }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
  } catch {
    return Response.json({ products: localCatalogue, source: 'local-fallback', stale: true });
  }
}
