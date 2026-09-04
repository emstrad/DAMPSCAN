/**
 * GET /api/admin/attachment?path=leads/2026-09-04/survey-abc123.pdf
 *
 * Streams one of a lead's attachments to a signed-in staff member. The blobs
 * are private, so this route is the only way to read one, and the path is
 * checked against the leads table rather than trusted: without that, an
 * authenticated user could walk the whole store by guessing pathnames, and a
 * bug that let an unauthenticated caller through would hand over everything.
 */
import { queryOne } from '../../lib/db.js';
import { json, requireMethod } from '../../lib/http.js';
import { requireAuth } from '../../lib/session.js';
import { readAttachment } from '../../lib/blob.js';
import { Readable } from 'node:stream';

export const config = { runtime: 'nodejs' };

const OWNED = `select 1 from leads where $1 = any(files) limit 1`;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const session = requireAuth(req, res);
  if (!session) return;

  const path = new URL(req.url, `https://${req.headers.host}`).searchParams.get('path') || '';
  if (!path) {
    json(res, 400, { ok: false, error: 'missing_path' });
    return;
  }

  let owned;
  try {
    owned = await queryOne(OWNED, [path]);
  } catch (err) {
    console.error('attachment lookup failed:', err.message);
    json(res, 500, { ok: false, error: 'lookup_failed' });
    return;
  }
  if (!owned) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  const file = await readAttachment(path);
  if (!file.ok) {
    json(res, file.reason === 'not_found' ? 404 : 502, { ok: false, error: file.reason });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', file.contentType);
  if (file.size) res.setHeader('Content-Length', String(file.size));
  /* attachment, not inline: a PDF or an image rendered in the dashboard's own
     origin is a stored file deciding what the staff area looks like. */
  res.setHeader('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(file.stream).pipe(res);
}
