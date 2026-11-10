/**
 * The pieces every assistant tool is built from: running a staff route as the
 * signed in person, the argument shapes, finding a job in their scope, and
 * the one place money is trimmed for somebody who works on a business but
 * does not manage it.
 *
 * Tools call the staff routes in-process rather than repeating their SQL, so
 * the checks, the audit rows and the phone notifications are exactly the
 * ones a tap on the screen gets.
 */
import { queryOne } from '../db.js';
import { businessFor } from '../quoted.js';
import { withActivity } from '../activity.js';
import { hideFigures } from '../figures.js';

/** Runs a staff route as the person and returns what it answered. */
export async function callRoute(handler, scope, { method = 'GET', url, body } = {}) {
  const req = { method, url, body, headers: { host: 'staff.internal' }, mcpScope: scope, socket: {} };
  let out = '';
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; },
    write(c) { out += c; return true; }, end(c) { if (c) out += c; }
  };
  await withActivity(handler, { via: 'ChatGPT' })(req, res);
  let data = null;
  try { data = out ? JSON.parse(out) : null; } catch { data = { raw: out.slice(0, 2000) }; }
  return { status: res.statusCode, data };
}

export const qs = (args, keys) => {
  const p = new URLSearchParams();
  for (const k of keys) if (args[k] !== undefined && args[k] !== null && args[k] !== '') p.set(k, String(args[k]));
  const s = p.toString();
  return s ? '?' + s : '';
};

/* Shared argument shapes. */
export const AREA = { type: 'string', enum: ['damp', 'roofing', 'ac'], description: 'damp is ATi and DampScan together, roofing is Verge Roofing, ac is CoolRight. Leave out for every business you hold.' };
export const SITE = { type: 'string', enum: ['dampscan', 'ati-london', 'roofing', 'ac'], description: 'One brand. Leave out for all.' };
export const RANGE = { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'], description: 'How far back. Defaults vary by list.' };
export { JOB_REF as ID } from './find-job.js';
export const DATE = { type: 'string', description: 'YYYY-MM-DD' };
export const TIME = { type: 'string', description: 'HH:MM, 24 hour clock' };

/* Every change tells the assistant to check first, in the words it reads. */
export const CONFIRM = ' Before calling, read back what will change (customer name, postcode and any amount; never a job number) and wait for the person to say yes.';

/* Every tool's answer loses the figures a worker may not see (lib/figures.js),
   including the ones a tool reads straight from a table rather than a route. */
const hiding = (run) => async (scope, args) => {
  const out = await run(scope, args);
  if (out && out.data) out.data = await hideFigures(out.data, scope);
  return out;
};
export const read = (name, title, description, properties, run) => ({ name, title, description, inputSchema: { type: 'object', properties, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false }, run: hiding(run) });
/* Records only (an email filed, a new customer's card added): the owners chose
   (10 Nov 2026) that the inbox sweep does these straight away, at all costs. */
export const RECORDS = ' It only records, so during an inbox sweep do it without asking first, then say what was filed or added.';
export const write = (name, title, description, properties, required, run, { idempotent = false, records = false } = {}) => ({
  name, title, description: description + (records ? RECORDS : CONFIRM), inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false }, run: hiding(run)
});
export const route = (handler, path, keys) => (scope, args) => callRoute(handler, scope, { url: path + qs(args, keys) });
export const fail = (message) => ({ status: 400, data: { ok: false, error: message } });
export const notFound = () => ({ status: 404, data: { ok: false, error: 'No job with that number in the businesses you hold.' } });

/** A job in the person's scope, with its business, or null. */
export async function jobInScope(scope, id) {
  const job = Number.isInteger(id) ? await queryOne('select * from jobs where id = $1', [id]) : null;
  if (!job || !scope.businesses.includes(job.site)) return null;
  return { job, business: await businessFor(job.site) };
}

export const canManage = (scope, site) => scope.isAdmin || (scope.levels || {})[site] === 'manage';

/**
 * A presented job as an assistant may repeat it. The staff route already
 * takes profit and hourly rates off for a worker; this also takes the payout
 * working, the frozen payout and the agreed day rates, which on the screen
 * sit behind the manage-only panels.
 */
export function trimJob(job, scope) {
  if (!job || typeof job !== 'object' || canManage(scope, job.site)) return job;
  const { payout, payoutRows, frozen, rates, profit, ...rest } = job;
  if (Array.isArray(rest.ownerDays)) rest.ownerDays = rest.ownerDays.map(({ dayRatePence, ...d }) => d);
  return rest;
}

/** A route's answer with any job in it trimmed for the viewer. */
export function trimmed(result, scope) {
  if (result && result.data && result.data.job) result.data = { ...result.data, job: trimJob(result.data.job, scope) };
  return result;
}

/* Route answers that are codes rather than words. */
const CODES = { forbidden: 'You do not hold that business.', not_found: 'No job with that number in the businesses you hold.', bad_id: 'That job number is not right.',
  nothing_to_update: 'Nothing was given to change.' };

/**
 * Why a change did not go through, as a sentence. Routes answer with an
 * error string, a code, or errors keyed by field ({surveyor: '...'}); the
 * last used to reach the to-do list as "unknown error".
 */
export function reasonOf(data) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return 'The server did not say why.';
  const fields = data.errors && typeof data.errors === 'object' ? Object.values(data.errors).filter(Boolean).map(String) : [];
  if (fields.length) return fields.join(' ');
  const e = data.error || data.message;
  if (typeof e === 'string' && e) return CODES[e] || (/_failed$/.test(e) ? 'The server hit an error saving it. Try again in a moment.' : e);
  if (e && typeof e === 'object') return reasonOf(e);
  return 'The server did not say why.';
}
