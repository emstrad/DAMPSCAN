/**
 * The customer portal: one private link per ATi or DampScan survey, where the
 * customer sees the one next step, their booking, payments, history and, once
 * paid in full, their report. Served through /api/quote (doc=portal) so it
 * adds no function of its own.
 *
 * The link is its own key (a long random token, separate from the quote and
 * rating tokens) and lasts 12 months from when it was made (the owner's
 * choice). Sending a new one replaces the old. Only what the customer should
 * see leaves here: never staff notes, to-dos, pay, or anyone else's diary.
 *
 * Built in the Lab first: it goes to customers once Twilio and Revolut are
 * set up, so for now only the owners make links (lib/routes/admin/hours.js).
 */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { query, queryOne } from './db.js';
import { DAMP_BRANDS } from './survey-messages.js';
import { readAttachment } from './blob.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const LIFE_MS = 365 * 86400000;
const ORIGIN = { dampscan: 'https://dampscan.co.uk', 'ati-london': 'https://atidampsurvey.co.uk' };
/* Each business's Google review link, set in Vercel once the profile gives one. */
const REVIEW = { dampscan: 'REVIEW_URL_DAMPSCAN', 'ati-london': 'REVIEW_URL_ATI' };

const day = (v) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
const firstName = (n) => String(n || '').trim().split(/\s+/).find((w) => !/^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(w)) || null;

/** A fresh link for a survey; any older link stops working. */
export async function issuePortal(jobId) {
  const token = randomBytes(24).toString('base64url');
  const j = await queryOne(`update jobs set portal_token = $2, portal_issued_at = now(), portal_opened_at = null
                             where id = $1 and site in ('dampscan', 'ati-london') returning site`, [jobId, token]);
  return j ? `${ORIGIN[j.site]}/my.html?t=${token}` : null;
}

const SELECT = `select j.*, j.job_date::text as job_day, r.label as survey_label, a.name as agent_name, a.branch as agent_branch,
       l.address_line1, l.town, l.created_at as lead_at, b.payment_details
  from jobs j left join job_rates r on r.key = j.survey_type left join estate_agents a on a.id = j.estate_agent_id
  left join leads l on l.id = j.lead_id left join businesses b on b.slug = j.site
 where j.portal_token = $1 and j.site in ('dampscan', 'ati-london')`;

/** The survey behind a link, or { gone } when the link is unknown or past its 12 months. */
export async function findPortal(token, now = Date.now()) {
  if (!TOKEN_RE.test(token || '')) return { gone: 'not_found' };
  const j = await queryOne(SELECT, [token]);
  if (!j) return { gone: 'not_found' };
  if (now - new Date(j.portal_issued_at).getTime() > LIFE_MS) return { gone: 'expired', site: j.site };
  return { job: j };
}

/* Where the survey is, in the customer's words, and the one thing to do next. */
function nextStep(j, m, today) {
  if (['cancelled', 'declined'].includes(j.status)) return { kind: 'cancelled', title: 'Not booked at the moment', detail: 'Get in touch if you would like to rebook.' };
  const booked = j.date_set && j.job_day && j.job_time && !j.awaiting_agent;
  const done = j.date_set && j.job_day && !j.awaiting_agent && (j.status === 'completed' || j.job_day < today);
  if (j.paid_at && j.survey_sent_at) return { kind: 'report', title: 'Your report is ready', detail: 'Download it below.' };
  if (j.survey_sent_at) return { kind: 'balance', title: 'Your report is ready', detail: `Pay the balance of ${m.balance} to unlock it.` };
  if (done) return { kind: 'writing', title: 'Your report is being written', detail: 'We will let you know as soon as it is ready.' };
  if (booked && !j.deposit_paid_at && m.depositPence) return { kind: 'deposit', title: `Pay your deposit of ${m.deposit}`, detail: 'This secures your survey.' };
  if (booked) return { kind: 'visit', title: 'Your survey is booked', detail: null };
  if (j.awaiting_agent) return { kind: 'agent', title: 'We are arranging access with your estate agent', detail: 'We will confirm the time once they come back to us.' };
  return { kind: 'requested', title: 'We have your request', detail: 'We will call to confirm a time.' };
}

const pounds = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
const STEPS = ['Requested', 'Booked', 'Surveyed', 'Report', 'Done'];
const STEP_OF = { requested: 0, agent: 0, cancelled: 0, deposit: 1, visit: 1, writing: 2, balance: 3, report: 4 };

/** Everything the portal page shows, customer-safe. */
export async function portalView(j, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  const brand = DAMP_BRANDS[j.site];
  const price = Number(j.survey_price_pence) || 0;
  const deposit = Math.ceil(price / 2);
  const paid = j.paid_at ? price : j.deposit_paid_at ? deposit : 0;
  const m = { deposit: pounds(deposit), depositPence: deposit, balance: pounds(price - paid) };
  const next = nextStep(j, m, today);
  const visit = j.date_set && j.job_day && j.job_time && !j.awaiting_agent ? { date: j.job_day, time: String(j.job_time).slice(0, 5), surveyor: cap(j.surveyor) } : null;
  const history = [
    [j.lead_at || j.created_at, 'Enquiry received'],
    [j.deposit_paid_at, 'Deposit received'],
    [visit && j.job_day < today ? `${j.job_day}T12:00:00Z` : null, 'Survey done'],
    [j.survey_sent_at, 'Report ready'],
    [j.paid_at, 'Paid in full']
  ].filter(([at]) => at).map(([at, what]) => ({ at: new Date(at).toISOString(), what })).sort((a, b) => a.at.localeCompare(b.at));
  if (!j.portal_opened_at) await query('update jobs set portal_opened_at = now() where id = $1', [j.id]);
  return {
    site: j.site,
    reference: `${(j.customer_postcode || '').replace(/\s/g, '').toUpperCase()}-${j.id}`,
    brand: { name: brand.name, phoneLabel: brand.phoneLabel, phone: brand.phoneLabel.replace(/\s/g, ''), origin: ORIGIN[j.site] },
    firstName: firstName(j.customer_name),
    address: j.customer_address || [j.address_line1, j.town].filter(Boolean).join(', ') || null,
    postcode: j.customer_postcode || null,
    survey: j.survey_label || null,
    next, step: STEP_OF[next.kind], steps: STEPS,
    visit,
    money: { pricePence: price, depositPence: deposit, paidPence: paid, balancePence: price - paid, depositPaid: Boolean(j.deposit_paid_at), paidInFull: Boolean(j.paid_at) },
    payTo: j.payment_details || null,
    report: j.survey_sent_at ? { unlocked: Boolean(j.paid_at && j.report_path), name: j.report_name || 'Survey report.pdf' } : null,
    agent: j.agent_name ? [j.agent_name, j.agent_branch].filter(Boolean).join(', ') : null,
    reviewUrl: j.paid_at && j.survey_sent_at ? process.env[REVIEW[j.site]] || null : null,
    history,
    expiresOn: day(new Date(new Date(j.portal_issued_at).getTime() + LIFE_MS))
  };
}

/** The report file, only once paid in full and sent. */
export async function portalReport(res, j) {
  if (!(j.paid_at && j.survey_sent_at && j.report_path)) { res.statusCode = 404; res.end(); return; }
  const file = await readAttachment(j.report_path);
  if (!file.ok) { res.statusCode = file.reason === 'not_found' ? 404 : 502; res.end(); return; }
  res.statusCode = 200;
  res.setHeader('Content-Type', file.contentType);
  if (file.size) res.setHeader('Content-Length', String(file.size));
  res.setHeader('Content-Disposition', `attachment; filename="${String(j.report_name || 'Survey report.pdf').replace(/["\\\r\n]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(file.stream).pipe(res);
}

/** Damp surveys matching a name or postcode, for the Lab's link maker. */
export async function portalSearch(q) {
  const like = `%${String(q || '').trim().replace(/[%_]/g, '')}%`;
  if (like.length < 4) return [];
  return (await query(`select id, customer_name, customer_postcode, job_date::text as job_date, portal_token is not null as has_link
      from jobs where site in ('dampscan', 'ati-london') and (customer_name ilike $1 or replace(customer_postcode, ' ', '') ilike replace($1, ' ', ''))
      order by id desc limit 8`, [like])).map((r) => ({ id: Number(r.id), name: r.customer_name, postcode: r.customer_postcode, date: r.job_date, hasLink: r.has_link }));
}
