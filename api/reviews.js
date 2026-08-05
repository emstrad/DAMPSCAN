/**
 * GET /api/reviews
 *
 * Real Google reviews for whichever site asked, chosen by the Host header the
 * same way every other route decides. Public and unauthenticated: it returns
 * only what is already on the business's own Google listing.
 *
 * Cached at the edge for a day. Reviews change slowly, Places bills per call,
 * and its terms do not allow holding results indefinitely, so a day is the
 * balance. stale-while-revalidate means a visitor never waits on Google.
 *
 * When it is not configured, or Google is unhappy, this answers 200 with an
 * empty list rather than an error. A missing review feed is not a broken page,
 * and the caller is written to leave the section alone in that case.
 */
import { json, requireMethod } from '../lib/http.js';
import { siteFor } from '../lib/site.js';
import { fetchGoogleReviews, MIN_REVIEWS } from '../lib/google-reviews.js';

export const config = { runtime: 'nodejs' };

const DAY = 86400;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const site = siteFor(req);
  const result = await fetchGoogleReviews(site);

  if (!result.ok) {
    // Worth a log line: an expired key or a wrong place id is otherwise silent,
    // because the page degrades quietly by design.
    console.warn(`reviews unavailable for ${site}: ${result.reason}`);
    // Short cache on a failure, so fixing the key does not wait out a full day.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    json(res, 200, { ok: true, site, configured: result.reason !== 'no_api_key' && result.reason !== 'no_place_id', reviews: [] });
    return;
  }

  if (result.held) {
    // Otherwise a correctly configured feed that shows nothing looks broken.
    console.info(`reviews held for ${site}: ${result.held} of ${MIN_REVIEWS} needed`);
  }

  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${DAY}, stale-while-revalidate=${DAY}`);
  json(res, 200, { ok: true, site, configured: true, place: result.place, reviews: result.reviews });
}
