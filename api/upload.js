/**
 * POST /api/upload?name=survey.pdf
 *
 * One previous survey or photo, attached to a booking. The body is the file
 * itself, so there is no multipart parsing to do and no dependency needed for
 * it: the browser sends one request per file.
 *
 * This route is open, because the visitor filling in the form has no account.
 * That makes three things load bearing rather than decorative: the same-origin
 * check, the rate limit, and the size cap read from the stream as it arrives
 * rather than from a header a caller controls.
 *
 * Answers 200 with stored:false when there is no Blob store. Like the address
 * lookup, that is the normal state until somebody turns it on, and the form
 * treats it as "we could not take the file" rather than as a broken booking.
 */
import { json, requireMethod, requireSameOrigin, ipHash } from '../lib/http.js';
import { rateLimit, pruneRateHits, LIMITS } from '../lib/ratelimit.js';
import { storeAttachment, blobConfigured } from '../lib/blob.js';

export const config = { runtime: 'nodejs' };

/* Vercel will not carry a request body over 4.5MB into a serverless function,
   so a larger cap here would only fail further out, with a platform error page
   instead of our JSON. The browser shrinks photos to fit before sending. */
const MAX_BYTES = 4 * 1024 * 1024;

/* Kept in step with public/assets/upload.js. The client copy is there to save
   somebody a 40MB upload before it is refused; this one is the check. */
const TYPES = new Set([
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'
]);
const EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|pdf)$/i;

/**
 * Reads the body, refusing as soon as it goes over the cap rather than after.
 * Vercel hands non-JSON bodies over already buffered on some runtimes and as a
 * stream on others, so both are handled.
 */
async function readBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.length > MAX_BYTES ? null : req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return size ? Buffer.concat(chunks) : Buffer.alloc(0);
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const limit = await rateLimit({ ...LIMITS.upload, ipHash: ipHash(req) });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(LIMITS.upload.windowSeconds));
    json(res, 429, { ok: false, error: 'too_many_requests' });
    return;
  }
  pruneRateHits();

  const url = new URL(req.url, 'http://localhost');
  const name = (url.searchParams.get('name') || 'attachment').slice(0, 120);
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

  /* An iPhone sometimes sends HEIC with no type at all, so the extension is the
     fallback. Anything that satisfies neither is refused outright. */
  if (!TYPES.has(contentType) && !EXTENSIONS.test(name)) {
    json(res, 415, { ok: false, error: 'unsupported_type' });
    return;
  }

  if (!blobConfigured()) {
    // Not an error the visitor caused, and not one they can do anything about.
    json(res, 200, { ok: false, stored: false, error: 'not_configured' });
    return;
  }

  const body = await readBody(req);
  if (body === null) {
    json(res, 413, { ok: false, error: 'too_large' });
    return;
  }
  if (!body.length) {
    json(res, 400, { ok: false, error: 'empty' });
    return;
  }

  const saved = await storeAttachment(name, contentType, body);
  if (!saved.ok) {
    json(res, 200, { ok: false, stored: false, error: saved.reason });
    return;
  }

  json(res, 200, { ok: true, stored: true, path: saved.path });
}
