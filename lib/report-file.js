/**
 * A survey's finished report as a file on its job.
 *
 * The assistant hands over a file the person uploaded in the chat as a short
 * lived download address; it is fetched once here and kept as a private blob.
 * Reading it back is through /api/admin/attachment, either signed in or with
 * a signed link that runs out, which is what the assistant gives to the
 * person's own Outlook connector to attach to the final email.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { storeAttachment } from './blob.js';

export const REPORT_TYPES = { 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
const MAX_BYTES = 25 * 1024 * 1024;
const LINK_DAYS = 7;

/* Only an https address, and no redirects, so the fetch cannot be pointed at
   anything on the server's own network. */
export async function fetchReport(url, name) {
  let u;
  try { u = new URL(String(url || '')); } catch { return { error: 'That file link is not right.' }; }
  if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return { error: 'That file link is not right.' };
  const res = await fetch(u, { redirect: 'error' }).catch(() => null);
  if (!res || !res.ok) return { error: 'The file could not be fetched. Upload it again.' };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return { error: 'That file is over 25MB.' };
  const pdf = buf.subarray(0, 5).toString() === '%PDF-';
  const docx = buf[0] === 0x50 && buf[1] === 0x4b && /\.docx$/i.test(name || '');
  if (!pdf && !docx) return { error: 'The report must be a PDF or a Word document.' };
  const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const clean = String(name || '').replace(/[^\w .-]/g, '').trim() || `report.${REPORT_TYPES[type]}`;
  const stored = await storeAttachment(clean, type, buf);
  if (!stored.ok) return { error: stored.reason === 'not_configured' ? 'File storage is not set up.' : 'The file could not be saved. Try again.' };
  return { path: stored.path, name: clean };
}

/* No secret, or a guessable one, would let anyone forge a link: make none and accept none. */
const secret = () => { const v = process.env.SESSION_SECRET; return v && v.length >= 16 ? v : null; };
const sign = (id, exp) => createHmac('sha256', secret()).update(`report:${id}:${exp}`).digest('hex');

/** A link to the job's report that works without signing in, for a week. */
export function reportLink(origin, id, now = Date.now()) {
  if (!secret()) return null;
  const exp = Math.floor(now / 1000) + LINK_DAYS * 86400;
  return `${origin}/api/admin/attachment?report=${id}&exp=${exp}&sig=${sign(id, exp)}`;
}

export function signedOk(id, exp, sig) {
  if (!secret() || !/^\d+$/.test(String(id)) || !/^\d+$/.test(String(exp)) || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(Number(id), Number(exp)));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

const UPLOAD_PATH = /^leads\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w .-]+$/i;

/**
 * The client card's upload, in two steps so a 10MB PDF never passes through
 * a function: {reportUpload: {name, type}} answers a one-off address the
 * browser puts the file to, then {reportPath, reportName} saves it on the job.
 * A worker uploads only for the surveys they do, as with the assistant.
 */
export async function reportBody(scope, job, body) {
  const { ownJobs } = await import('./figures.js');
  const manages = scope.isAdmin || (scope.levels || {})[job.site] === 'manage';
  if (!manages && !(await ownJobs(scope)).has(Number(job.id))) return { status: 403, data: { ok: false, error: 'That report is for a survey somebody else is doing.' } };
  if (!['dampscan', 'ati-london'].includes(job.site)) return { status: 400, data: { ok: false, error: 'Reports are for ATi and DampScan surveys.' } };
  if (body.reportUpload) {
    const { presignAttachment } = await import('./blob.js');
    const name = String(body.reportUpload.name || 'report.pdf').slice(0, 120);
    const signed = await presignAttachment(name, Object.keys(REPORT_TYPES), MAX_BYTES);
    return signed.ok ? { status: 200, data: { ok: true, url: signed.url, path: signed.path } }
      : { status: 503, data: { ok: false, error: signed.reason === 'not_configured' ? 'File storage is not set up.' : 'Could not start the upload. Try again.' } };
  }
  const path = String(body.reportPath || '');
  if (!UPLOAD_PATH.test(path)) return { status: 400, data: { ok: false, error: 'That upload is not right.' } };
  const name = String(body.reportName || path.split('/').pop().slice(37)).replace(/[^\w .-]/g, '').slice(0, 120) || 'report.pdf';
  const { query } = await import('./db.js');
  const { record } = await import('./audit.js');
  await query('update jobs set report_path = $2, report_name = $3, report_at = now(), updated_at = now() where id = $1', [job.id, path, name]);
  await record({ scope, business: job.site, entity: 'job', entityId: job.id, action: 'report_file', before: { name: job.report_name || null }, after: { name } });
  return { status: 200, data: { ok: true, reportFile: name } };
}
