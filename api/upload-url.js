/**
 * POST /api/upload-url  {"name": "survey.pdf", "type": "application/pdf"}
 *
 * Hands back a short-lived URL the browser PUTs the file straight to, plus the
 * pathname that file will end up at.
 *
 * The reason this route exists rather than everything going through
 * /api/upload: Vercel will not carry a request body over 4.5MB into a
 * function, and a previous damp survey is routinely a 10MB PDF. A presigned
 * PUT never touches a function, so the limit does not apply.
 *
 * Nothing here trusts the browser with anything. The pathname is generated
 * server side, the token is scoped to that one path, and the content type and
 * size ceiling are signed into the URL so Vercel enforces them rather than us.
 * The worst a stolen URL can do is write one file, once, to a path nobody can
 * read without a staff login.
 */
import { json, requireMethod, requireSameOrigin, readJson, ipHash, str } from '../lib/http.js';
import { rateLimit, pruneRateHits, LIMITS } from '../lib/ratelimit.js';
import { presignAttachment, blobConfigured, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '../lib/blob.js';

export const config = { runtime: 'nodejs' };

const EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|pdf)$/i;

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

  const body = await readJson(req);
  const name = str(body.name, 120) || 'attachment';
  const type = (str(body.type, 100) || '').toLowerCase();

  /* An iPhone sends HEIC with no type at all, so the extension is the
     fallback. Anything satisfying neither is refused before a token is made. */
  if (!ATTACHMENT_TYPES.includes(type) && !EXTENSIONS.test(name)) {
    json(res, 415, { ok: false, error: 'unsupported_type' });
    return;
  }

  if (!blobConfigured()) {
    json(res, 200, { ok: false, stored: false, error: 'not_configured' });
    return;
  }

  const signed = await presignAttachment(name, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES);
  if (!signed.ok) {
    // The browser posts through /api/upload instead, which still works for
    // anything under 4MB. Not an error the visitor should ever see.
    json(res, 200, { ok: false, stored: false, error: signed.reason });
    return;
  }

  json(res, 200, { ok: true, url: signed.url, path: signed.path, maxBytes: MAX_ATTACHMENT_BYTES });
}
