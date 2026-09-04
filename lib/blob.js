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
import { put, get } from '@vercel/blob';

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
