/**
 * POST /api/upload?mode=presign   {"name": "survey.pdf", "type": "application/pdf"}
 * POST /api/upload?name=survey.pdf   with the file itself as the body
 *
 * The two halves of one question: where do I put this file. They share a route
 * because a file under api/ is a serverless function and a deployment has a
 * ceiling on how many of those it may have, and because everything before the
 * branch, the origin check, the throttle and the type check, was already
 * identical in both.
 *
 * presign hands back a short-lived URL the browser PUTs straight to Blob. That
 * is the path that matters: Vercel will not carry a request body over 4.5MB
 * into a function, and a previous damp survey is routinely a 10MB PDF, so a
 * presigned PUT never touches a function and the limit does not apply.
 *
 * The default mode proxies the bytes through here instead, capped just under
 * what the platform will carry. It is the fallback for when presigning is
 * unavailable, so a store that cannot presign degrades to small files rather
 * than breaking.
 *
 * This route is open, because the visitor filling in the form has no account.
 * That makes three things load bearing rather than decorative: the same-origin
 * check, the rate limit, and the size cap read from the stream as it arrives
 * rather than from a header a caller controls. Nothing here trusts the browser
 * with a pathname either: presign generates it server side and scopes the
 * token to that one path, and the content type and size ceiling are signed
 * into the URL so Vercel enforces them rather than us.
 *
 * Answers 200 with stored:false when there is no Blob store. Like the address
 * lookup, that is the normal state until somebody turns it on, and the form
 * treats it as "we could not take the file" rather than as a broken booking.
 */
import { json, requireMethod, requireSameOrigin, readJson, ipHash, str } from '../lib/http.js';
import { rateLimitBoth, pruneRateHits, LIMITS } from '../lib/ratelimit.js';
import {
  storeAttachment, presignAttachment, blobConfigured,
  ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_PROXY_BYTES
} from '../lib/blob.js';

export const config = { runtime: 'nodejs' };

const TYPES = new Set(ATTACHMENT_TYPES);
/* An iPhone sends HEIC with no type at all, so the extension is the fallback.
   Anything satisfying neither is refused before a token or a byte is taken. */
const EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|pdf)$/i;
const allowed = (name, type) => TYPES.has(type) || EXTENSIONS.test(name);

/**
 * Reads the body, refusing as soon as it goes over the cap rather than after.
 * Vercel hands non-JSON bodies over already buffered on some runtimes and as a
 * stream on others, so both are handled.
 */
async function readBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.length > MAX_PROXY_BYTES ? null : req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PROXY_BYTES) return null;
    chunks.push(chunk);
  }
  return size ? Buffer.concat(chunks) : Buffer.alloc(0);
}

/** A URL the browser PUTs the file straight to, and the path it lands at. */
async function presign(req, res) {
  const body = await readJson(req);
  const name = str(body.name, 120) || 'attachment';
  const type = (str(body.type, 100) || '').toLowerCase();

  if (!allowed(name, type)) {
    json(res, 415, { ok: false, error: 'unsupported_type' });
    return;
  }
  if (!blobConfigured()) {
    json(res, 200, { ok: false, stored: false, error: 'not_configured' });
    return;
  }

  const signed = await presignAttachment(name, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES);
  if (!signed.ok) {
    // The browser posts the bytes through here instead, which still works for
    // anything under 4MB. Not an error the visitor should ever see.
    json(res, 200, { ok: false, stored: false, error: signed.reason });
    return;
  }

  json(res, 200, { ok: true, url: signed.url, path: signed.path, maxBytes: MAX_ATTACHMENT_BYTES });
}

/** The bytes, through this function. Capped by what the platform will carry. */
async function proxy(req, res, url) {
  const name = (url.searchParams.get('name') || 'attachment').slice(0, 120);
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

  if (!allowed(name, contentType)) {
    json(res, 415, { ok: false, error: 'unsupported_type' });
    return;
  }
  if (!blobConfigured()) {
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

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const limit = await rateLimitBoth({ perIp: LIMITS.upload, global: LIMITS.uploadGlobal, ipHash: ipHash(req) });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(LIMITS.upload.windowSeconds));
    json(res, 429, { ok: false, error: 'too_many_requests' });
    return;
  }
  pruneRateHits();

  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('mode') === 'presign'
    ? presign(req, res)
    : proxy(req, res, url);
}
