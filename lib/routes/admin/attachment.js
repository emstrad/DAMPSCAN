/**
 * GET /api/admin/attachment?path=leads/2026-09-04/survey-abc123.pdf
 *
 * Streams one of a lead's attachments to a signed-in staff member. The blobs
 * are private, so this route is the only way to read one, and the path is
 * checked against the leads table rather than trusted: without that, an
 * authenticated user could walk the whole store by guessing pathnames, and a
 * bug that let an unauthenticated caller through would hand over everything.
 */
import { queryOne } from '../../db.js';
import { json, requireMethod } from '../../http.js';
import { readSession } from '../../session.js';
import { scopeFor } from '../../access.js';
import { readAttachment } from '../../blob.js';
import { Readable } from 'node:stream';
import { signedOk } from '../../report-file.js';
import { ownJobs } from '../../figures.js';

export const config = { runtime: 'nodejs' };

/* Which business the file belongs to, so the scope can be checked: a person
   granted roofing must not be able to fetch a damp customer's photographs by
   guessing a path. */
const OWNED = `select site from leads where $1 = any(files) union all select site from jobs where $1 = any(customer_files) limit 1`;

/* The uuid the presign put on the front to keep two survey.pdf apart is not
   something a person should have to read. Kept in step with leads-table.js. */
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
export const downloadName = (path) => path.split('/').pop().replace(UUID_PREFIX, '');

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const params = new URL(req.url, `https://${req.headers.host}`).searchParams;
  /* A survey report by its job: with a signed link (for the final email) or signed in. */
  if (params.get('report')) return sendReport(req, res, params);

  /* These links arrive by email and get opened on a phone that has never seen
     the staff area, so a signed-out browser is sent to sign in and then back
     here, rather than shown a JSON 401 it cannot do anything with. Anything
     that is not a browser navigation still gets the 401. */
  const session = readSession(req);
  if (!session) {
    if (String(req.headers.accept || '').includes('text/html')) {
      res.statusCode = 302;
      res.setHeader('Location', '/staff?next=' + encodeURIComponent(req.url));
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }
    json(res, 401, { ok: false, error: 'unauthorised' });
    return;
  }

  const path = params.get('path') || '';
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
  /* Outside the scope reads as absent, the same as everywhere else. */
  const scope = await scopeFor(session);
  req.scope = scope;
  if (!owned || !scope || !scope.businesses.includes(owned.site)) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  const file = await readAttachment(path);
  if (!file.ok) {
    json(res, file.reason === 'not_found' ? 404 : 502, { ok: false, error: file.reason });
    return;
  }

  stream(res, file, downloadName(path));
}

async function sendReport(req, res, params) {
  const id = params.get('report');
  const signed = signedOk(id, params.get('exp'), params.get('sig'));
  const session = signed ? null : readSession(req);
  if (!signed && !session) { json(res, 401, { ok: false, error: 'unauthorised' }); return; }
  const job = /^\d+$/.test(id) ? await queryOne('select site, report_path, report_name from jobs where id = $1', [Number(id)]) : null;
  const scope = session ? await scopeFor(session) : null;
  /* A worker reads only the reports of jobs they survey, like the phone and email. */
  const mine = scope && !scope.isAdmin && (scope.levels || {})[job && job.site] !== 'manage' ? (await ownJobs(scope)).has(Number(id)) : true;
  if (!job || !job.report_path || (!signed && (!scope || !scope.businesses.includes(job.site) || !mine))) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  const file = await readAttachment(job.report_path);
  if (!file.ok) { json(res, file.reason === 'not_found' ? 404 : 502, { ok: false, error: file.reason }); return; }
  stream(res, file, job.report_name || downloadName(job.report_path));
}

function stream(res, file, name) {
  res.statusCode = 200;
  res.setHeader('Content-Type', file.contentType);
  if (file.size) res.setHeader('Content-Length', String(file.size));
  /* attachment, not inline: a PDF or an image rendered in the dashboard's own
     origin is a stored file deciding what the staff area looks like. */
  res.setHeader('Content-Disposition', `attachment; filename="${String(name).replace(/["\\\r\n]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(file.stream).pipe(res);
}
