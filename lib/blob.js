/**
 * Attachment storage.
 *
 * Files go to Vercel Blob rather than into Postgres. A database is a poor place
 * to keep binaries, and a Neon free tier is half a gigabyte, which a few weeks of
 * attachments would fill on its own.
 *
 * They are stored private. A previous damp report carries an address, a
 * surveyor's findings and often photographs of somebody's home, and a public
 * blob URL is readable by anyone who ever sees it: in a forwarded email, in a
 * proxy log, in a screenshot. Private means every read goes through
 * /api/admin/attachment, which checks the staff session first.
 *
 * Optional, like the address lookup. With no BLOB_READ_WRITE_TOKEN set the
 * upload endpoint says so and the form quietly stops offering attachments. A
 * booking is never blocked by one.
 */
import { put, get, issueSignedToken, presignUrl } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

/**
 * What an attachment is allowed to be. Both numbers are real limits rather
 * than preferences, and they are different because the two upload paths are:
 *
 *   MAX_ATTACHMENT_BYTES  a presigned PUT, browser straight to Blob. 25MB is
 *                         our own ceiling, chosen to be past any survey report
 *                         anyone has sent us.
 *   MAX_PROXY_BYTES       posting through /api/upload. 4.5MB is as much as
 *                         Vercel will carry into a function, so this sits just
 *                         under it. Only used when presigning is unavailable.
 */
export const ATTACHMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'
];
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_PROXY_BYTES = 4 * 1024 * 1024;

/** True when a store is wired up. Checked before anything else is attempted. */
export function blobConfigured() {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || '').trim());
}

/* A visitor's filename reaches the store, so it is stripped to something that
   cannot climb out of the prefix or confuse a Content-Disposition header. The
   random suffix Blob adds is what actually keeps two "survey.pdf" apart. */
function safeName(name) {
  const clean = String(name || '')
    .split(/[\\/]/).pop()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80);
  return clean || 'attachment';
}

/**
 * Stores one file and returns its pathname, which is what the lead row keeps.
 * The URL is deliberately not returned: a private blob's URL is not usable on
 * its own, and storing it would only invite somebody to paste it somewhere.
 *
 * @returns {Promise<{ok:boolean, path?:string, reason?:string}>}
 */
export async function storeAttachment(name, contentType, body) {
  if (!blobConfigured()) return { ok: false, reason: 'not_configured' };

  const day = new Date().toISOString().slice(0, 10);
  try {
    const blob = await put(`leads/${day}/${safeName(name)}`, body, {
      access: 'private',
      addRandomSuffix: true,
      contentType: contentType || 'application/octet-stream'
    });
    return { ok: true, path: blob.pathname };
  } catch (err) {
    console.warn('attachment upload failed:', err.message);
    return { ok: false, reason: 'store_failed' };
  }
}

const SIGN_WINDOW_MS = 10 * 60 * 1000;

/**
 * A short-lived URL the browser can PUT a file straight to.
 *
 * This exists because a Vercel function will not accept a request body over
 * 4.5MB, and a previous damp survey is routinely a 10MB PDF full of
 * photographs. A presigned PUT goes browser to Blob without passing through a
 * function at all, so the platform limit does not apply.
 *
 * The pathname is generated here rather than taken from the caller, and the
 * token is scoped to exactly that one path, so a presigned URL cannot be
 * pointed at anything else in the store. Content type and size are enforced by
 * Vercel against the signature, which makes them real limits rather than
 * something the browser is trusted to respect.
 *
 * @returns {Promise<{ok:boolean, url?:string, path?:string, reason?:string}>}
 */
export async function presignAttachment(name, contentTypes, maxBytes) {
  if (!blobConfigured()) return { ok: false, reason: 'not_configured' };

  const day = new Date().toISOString().slice(0, 10);
  const path = `leads/${day}/${randomUUID()}-${safeName(name)}`;
  const validUntil = Date.now() + SIGN_WINDOW_MS;

  try {
    const signed = await issueSignedToken({
      pathname: path,
      operations: ['put'],
      validUntil,
      allowedContentTypes: contentTypes,
      maximumSizeInBytes: maxBytes
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      access: 'private',
      pathname: path,
      validUntil,
      allowedContentTypes: contentTypes,
      maximumSizeInBytes: maxBytes,
      /* The UUID above already makes the path unique, so the suffix is not
         needed and leaving it off means the final pathname is known here,
         before the upload, rather than read back out of the response. */
      addRandomSuffix: false
    });
    return { ok: true, url: presignedUrl, path };
  } catch (err) {
    /* Worth a log line and nothing more. The browser falls back to posting
       through /api/upload, which still carries anything under 4MB, so a store
       that cannot presign degrades rather than breaks. */
    console.warn('presign failed, client will fall back to the proxy route:', err.message);
    return { ok: false, reason: 'presign_failed' };
  }
}

/**
 * Reads one back for the dashboard.
 * @returns {Promise<{ok:boolean, stream?:ReadableStream, contentType?:string, size?:number, reason?:string}>}
 */
export async function readAttachment(path) {
  if (!blobConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const found = await get(path, { access: 'private' });
    if (!found || found.statusCode !== 200) return { ok: false, reason: 'not_found' };
    return {
      ok: true,
      stream: found.stream,
      contentType: found.blob.contentType || 'application/octet-stream',
      size: found.blob.size
    };
  } catch (err) {
    console.warn('attachment read failed:', err.message);
    return { ok: false, reason: 'read_failed' };
  }
}
