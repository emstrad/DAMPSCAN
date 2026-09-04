/**
 * GET /api/address?postcode=N1+3GZ
 *
 * Addresses for a postcode, so the booking form can offer a list to pick from
 * rather than three boxes to type into.
 *
 * Rate limited on the same table as everything else, because an unauthenticated
 * endpoint in front of a metered third party API is somebody else's bill if it
 * is left open. Cached at the edge for a day: the addresses in a postcode do
 * not change on a timescale that matters, and every cache hit is a lookup not
 * paid for.
 *
 * Answers 200 with configured:false when no key is set. That is not an error,
 * it is the normal state until somebody buys a provider, and the form is
 * written to fall back to typed fields when it sees it.
 */
import { json, requireMethod, ipHash } from '../lib/http.js';
import { rateLimit, pruneRateHits, LIMITS } from '../lib/ratelimit.js';
import { lookupAddresses } from '../lib/address.js';

export const config = { runtime: 'nodejs' };

const DAY = 86400;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const url = new URL(req.url, 'http://localhost');
  const postcode = (url.searchParams.get('postcode') || '').slice(0, 12);

  const limit = await rateLimit({ ...LIMITS.address, ipHash: ipHash(req) });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(LIMITS.address.windowSeconds));
    json(res, 429, { ok: false, error: 'too_many_requests' });
    return;
  }
  pruneRateHits();

  const result = await lookupAddresses(postcode);

  if (!result.ok) {
    // Worth a log line: a wrong or expired key is otherwise silent, because the
    // form degrades to typed fields without telling anybody.
    if (result.reason !== 'bad_postcode') console.warn(`address lookup failed: ${result.reason}`);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    json(res, 200, { ok: true, configured: result.configured, addresses: [] });
    return;
  }

  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${DAY}, stale-while-revalidate=${DAY}`);
  json(res, 200, { ok: true, configured: result.configured, postcode: result.postcode, addresses: result.addresses });
}
