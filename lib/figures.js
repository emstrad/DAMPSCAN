/**
 * What somebody granted 'work' on a business (a surveyor, a crew member) may
 * see of it: the work, who, where, when and what is outstanding, but never
 * what any of it is worth, and a customer's contact details only on the jobs
 * that are theirs.
 *
 * Routes used to decide the money one by one, and the ones that forgot
 * leaked a price or a deposit to a surveyor's phone. So it is decided once
 * more, at the edge, for every staff route (api/admin/[action].js) and every
 * assistant tool (lib/mcp/shared.js): the answer is walked and, in rows of a
 * business the viewer does not manage,
 *   - any key that names money is dropped;
 *   - on a job that is not theirs, phone, email, street address and message
 *     links are dropped, a name becomes the first name and a postcode its
 *     district.
 * A row says its business by `site` (or `business_slug`, `slug`); anything
 * that does not say is treated as belonging to every business the person
 * holds, so a total across a business they only work on is dropped too.
 *
 * Only figures go: a number, a numeric string, or a structure of them (a
 * payout, a list of payments). A tick such as `deposit: true` or a date such
 * as `paidAt` stays, because "deposit paid" is work to know about and the
 * amount is not.
 */
import { query } from './db.js';

/* Keys that name money. Deliberately broad: a false positive hides a figure
   from a worker, a false negative shows one. */
const MONEY = /pence$|price|amount|owed|balance|profit|^fees?$|fee(Base|Percent|s)?$|earn|invoice|cost|deposit(?!PaidAt|_paid_at|Paid$|_paid$)|^pay$|^pay_|^payouts?$|^payoutRows$|^payments$|^frozen$|bp$|^rates$|takings|turnover|revenue|income/i;
const CONTACT = /phone|email|^address|addressLine|address_line|^line[12]$|street|mobile|whatsapp|^tel$|^files$|lead_files|leadFiles|^maps$|^notes$|^message$|^sessionId$|^session_id$/i;
const LINK = /wa\.me\/|whatsapp\.com|^sms:|^tel:|^mailto:/i;
const NAME = /^(name|customer|customerName|customer_name|firstName|first_name)$/;
const POSTCODE = /^(postcode|customerPostcode|customer_postcode)$/;
const SLUGS = ['dampscan', 'ati-london', 'roofing', 'ac'];

/** Whether this person sees money (and every contact) for this business. */
export function seesMoney(scope, site) {
  return Boolean(scope && (scope.isAdmin || (scope.levels || {})[site] === 'manage'));
}

/** Whether anything at all needs hiding from this person. */
export function hidesAny(scope) {
  return Boolean(scope && !scope.isAdmin && (scope.businesses || []).some((s) => !seesMoney(scope, s)));
}

/** The jobs.surveyor key a person answers to: "Ben" or "Ben Hart" is 'ben'. */
export const surveyorKey = (name) => String(name || '').trim().split(/\s+/)[0].toLowerCase();

/** A postcode's district, "ME14 2AB" to "ME14". */
export function district(pc) {
  const s = String(pc || '').toUpperCase().replace(/\s+/g, '');
  return s.length > 4 ? s.slice(0, -3) : s;
}

/** The ids of the jobs that are this person's: surveyed by them or handed to them. */
export async function ownJobs(scope) {
  if (!scope || scope.personId == null) return new Set();
  const key = surveyorKey(scope.name);
  try {
    const rows = await query('select id from jobs where lower(surveyor) = $1 or assigned_person_id = $2', [key, scope.personId]);
    return new Set(rows.map((r) => Number(r.id)));
  } catch {
    /* assigned_person_id not there yet: the surveyor alone decides. */
    const rows = await query('select id from jobs where lower(surveyor) = $1', [key]);
    return new Set(rows.map((r) => Number(r.id)));
  }
}

const isFigure = (v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()))
  || (Array.isArray(v) && v.length > 0) || (v !== null && typeof v === 'object' && !Array.isArray(v));

function siteOf(obj) {
  const s = obj.site || obj.business_slug || obj.businessSlug || obj.slug;
  return SLUGS.includes(s) ? s : null;
}

/* Is this row one of the person's own jobs? A lead's id is not a job's id, so
   a bare id counts only on a row shaped like a job. */
function mine(obj, ctx) {
  if (obj.surveyor && surveyorKey(obj.surveyor) === ctx.key) return true;
  const assigned = obj.assignedPersonId ?? obj.assigned_person_id;
  if (assigned != null && Number(assigned) === ctx.personId) return true;
  const jobId = obj.jobId ?? obj.job_id;
  if (jobId != null) return ctx.owned.has(Number(jobId));
  const jobShaped = 'surveyor' in obj || 'jobDate' in obj || 'job_date' in obj || 'surveyDate' in obj || 'quoted' in obj;
  return jobShaped && obj.id != null && ctx.owned.has(Number(obj.id));
}

function walk(value, ctx, managed, open) {
  if (Array.isArray(value)) return value.map((v) => walk(v, ctx, managed, open));
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const site = siteOf(value);
  const here = site ? seesMoney(ctx.scope, site) : managed;
  /* Contacts: open for a manager, else only on the person's own job. A row
     without a business inherits from the row it sits in. */
  const contacts = here || (site ? mine(value, ctx) : open);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!here && MONEY.test(k) && isFigure(v)) continue;
    if (!contacts) {
      /* An address object keeps its town and district; its lines go below. */
      const nested = v !== null && typeof v === 'object' && !Array.isArray(v);
      if (CONTACT.test(k) && v != null && v !== false && !nested) continue;
      if (typeof v === 'string' && LINK.test(v)) continue;
      if (NAME.test(k) && typeof v === 'string') { out[k] = v.trim().split(/\s+/)[0]; continue; }
      if (POSTCODE.test(k) && typeof v === 'string') { out[k] = district(v); continue; }
    }
    out[k] = walk(v, ctx, here, contacts);
  }
  return out;
}

/** The answer with every figure and contact the person may not see taken out. */
export async function hideFigures(data, scope) {
  if (!hidesAny(scope)) return data;
  const ctx = { scope, key: surveyorKey(scope.name), personId: scope.personId, owned: await ownJobs(scope) };
  /* At the top nothing says which business, so contacts start closed. */
  return walk(data, ctx, false, false);
}

/**
 * A route handler whose JSON answer passes through hideFigures for whoever
 * asked. The scope is the one requireScope resolved for the request.
 */
export function withFigures(handler) {
  return async (req, res) => {
    const end = res.end.bind(res);
    let pending = null;
    res.end = (chunk, ...rest) => {
      const scope = req.scope || req.mcpScope;
      const type = String((res.getHeader && res.getHeader('content-type')) || '');
      if (!chunk || !hidesAny(scope) || !type.includes('application/json')) return end(chunk, ...rest);
      let parsed;
      try { parsed = JSON.parse(String(chunk)); } catch { return end(chunk, ...rest); }
      pending = hideFigures(parsed, scope).then((d) => end(JSON.stringify(d), ...rest), () => end('{"ok":false,"error":"failed"}'));
      return res;
    };
    await handler(req, res);
    if (pending) await pending;
  };
}
