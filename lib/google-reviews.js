/**
 * Real Google reviews, read from the Places API.
 *
 * Two limits worth knowing, because they shape everything here:
 *
 *   1. Place Details returns at most five reviews, and Google chooses which
 *      five. There is no paging. Pulling the full set needs the Business
 *      Profile API, which is owner-authenticated and gated behind an access
 *      request, so this uses Places and shows what it gives.
 *   2. Places results may not be cached indefinitely. Responses here are cached
 *      at the edge for a day, which keeps well inside that and means Google is
 *      called roughly once per day per region rather than once per visitor.
 *
 * Nothing is invented. If the key or the place id is missing, or Google answers
 * with anything unexpected, this returns an empty list and the caller decides
 * what to show. It never falls back to sample text.
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places/';

/**
 * A carousel holding one or two reviews reads worse than no carousel at all,
 * and a listing that new is not evidence of anything yet. Below this the
 * reviews are withheld here rather than in the page, so there is one rule
 * rather than one per site. Places returns at most five, so five means the
 * profile has at least five.
 */
export const MIN_REVIEWS = 5;

// Only the fields actually rendered. Places bills by field mask, so asking for
// less is both cheaper and less data held than needed.
const FIELD_MASK = 'id,displayName,rating,userRatingCount,googleMapsUri,reviews';

export const PLACE_ID_VARS = {
  dampscan: 'GOOGLE_PLACE_ID_DAMPSCAN',
  'ati-london': 'GOOGLE_PLACE_ID_ATI'
};

export function placeIdFor(site) {
  const name = PLACE_ID_VARS[site];
  return name ? (process.env[name] || '').trim() : '';
}

/** Star ratings are integers 1 to 5. Anything else is not a rating. */
function starRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * One Google review, reduced to what the carousel renders. Google requires the
 * author name and the review text to be shown as given, so neither is trimmed
 * or reworded here.
 */
function toCard(review) {
  const text = (review?.originalText?.text || review?.text?.text || '').trim();
  const author = (review?.authorAttribution?.displayName || '').trim();
  const rating = starRating(review?.rating);
  if (!text || !author || !rating) return null;
  return {
    text,
    attr: author,
    src: 'Google review',
    rating,
    photo: review?.authorAttribution?.photoUri || '',
    profile: review?.authorAttribution?.uri || '',
    at: review?.publishTime || ''
  };
}

/**
 * @returns {Promise<{ok: boolean, reason?: string, place?: object, reviews: object[]}>}
 */
export async function fetchGoogleReviews(site) {
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const placeId = placeIdFor(site);
  if (!key) return { ok: false, reason: 'no_api_key', reviews: [] };
  if (!placeId) return { ok: false, reason: 'no_place_id', reviews: [] };

  let res;
  try {
    res = await fetch(ENDPOINT + encodeURIComponent(placeId), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
        'Accept-Language': 'en-GB'
      }
    });
  } catch (err) {
    return { ok: false, reason: `unreachable: ${String(err.message || err).slice(0, 120)}`, reviews: [] };
  }

  if (!res.ok) {
    // The body carries Google's own explanation, which is the difference
    // between a bad key, a restricted key and a wrong place id.
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: `http_${res.status}: ${detail.slice(0, 200)}`, reviews: [] };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: 'unparseable', reviews: [] };
  }

  const reviews = Array.isArray(data.reviews) ? data.reviews.map(toCard).filter(Boolean) : [];
  const enough = reviews.length >= MIN_REVIEWS;

  return {
    ok: true,
    place: {
      name: data.displayName?.text || '',
      rating: typeof data.rating === 'number' ? data.rating : null,
      total: typeof data.userRatingCount === 'number' ? data.userRatingCount : 0,
      url: data.googleMapsUri || ''
    },
    // Held back rather than trimmed: the caller gets nothing to show, and the
    // count so a log line can say why the carousel is still hidden.
    reviews: enough ? reviews : [],
    held: enough ? 0 : reviews.length
  };
}
