/**
 * GET /api/admin/conversions?site=ati-london&key=...
 *
 * The paid-job file Google Ads fetches on its own schedule
 * (lib/ads-conversions.js). The key is the brand's own, so no sign-in.
 */
import { json } from '../../http.js';
import { keyOk, conversionsFor, conversionsCsv, fetched } from '../../ads-conversions.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Use GET' });
  const params = new URL(req.url, 'https://x').searchParams;
  const site = params.get('site') || '';
  if (!['dampscan', 'ati-london', 'roofing', 'ac'].includes(site) || !keyOk(site, params.get('key'))) return json(res, 404, { ok: false, error: 'not_found' });
  try {
    const csv = conversionsCsv(await conversionsFor(site));
    /* Growth and Settings say when Google last came for it. */
    await fetched(site).catch(() => {});
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(csv);
  } catch (err) {
    console.error('conversions file failed:', err.message);
    json(res, 500, { ok: false, error: 'conversions_failed' });
  }
}
