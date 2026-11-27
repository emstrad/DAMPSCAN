/**
 * What an estate agent can do from their page (lib/agent-portal.js): Quick
 * book a survey for their buyer, confirm a time we proposed for access, or ask
 * for another. Quick book makes an enquiry exactly as the website form does
 * (the same alerts, owners' text, backup email, same-person merge and the
 * buyer's thanks text), put down to the agent, then hands back the enquiry's
 * key so the page uses the website's own survey, times and pick steps
 * (/api/lead op survey, times, pick): Book it straight away books it there and
 * then, with the buyer's booked text and deposit link. The agent confirms
 * access by booking, so the survey never waits on them.
 */
import { randomUUID } from 'node:crypto';
import { query, queryOne } from './db.js';
import { normalisePostcode, addressLine } from './validate.js';
import { mergeDuplicates } from './merge-dupes.js';
import { notify } from './notify.js';
import { enquiryAlert } from './alert-enquiry.js';
import { textOwners, enquiryText, call } from './staff-sms.js';
import { sendLeadEmail } from './lead-email.js';
import { queueText, flushDue } from './texts.js';
import { callRoute } from './mcp/shared.js';
import clients from './routes/admin/clients.js';
import { brandName, customer, jobPage, staffBase } from './alert-words.js';
import { agentJob } from './agent-portal.js';
import { bookedAlready } from './booked-already.js';

export const REASONS = { valuer: 'Mortgage valuer flagged damp', buyer: 'Buyer is worried about damp', vendor: 'Vendor wants a survey before selling', other: 'Something else' };
export const ACCESS = { agent: 'We have the keys', vendor: 'The vendor lets you in', tenant: 'The tenant lets you in' };
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
/** A UK number of the right length (11 digits), +44 read as 0. */
export function ukPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return { ok: true, value: null };
  if (/[^\d\s+]/.test(raw) || /\+/.test(raw.slice(1))) return { ok: false };
  const d = raw.replace(/\s/g, '').replace(/^\+44/, '0');
  return /^0\d{10}$/.test(d) ? { ok: true, value: d } : { ok: false };
}
const who = (a) => a.name + (a.branch ? ` (${a.branch})` : '');
/* "sam patel" or "SAM PATEL" as typed in a hurry reads "Sam Patel" in their texts; a name with its own capitals is left alone. */
export const nameCase = (v) => (v === v.toLowerCase() || v === v.toUpperCase()
  ? v.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : v);
const digitsOf = (v) => String(v || '').replace(/\D/g, '').replace(/^44/, '0');

/** Checks the agent's Quick book and makes the enquiry. Returns { leadId, sessionId } for the time steps. */
export async function quickBook(a, b) {
  const errors = {};
  const name = nameCase(clean(b.name, 80)), postcode = normalisePostcode(b.postcode), line1 = addressLine(b.address), town = addressLine(b.town, 60);
  const phone = ukPhone(b.phone), email = clean(b.email, 120).toLowerCase();
  if (!line1) errors.address = 'Type the first line of the address.';
  if (!postcode) errors.postcode = 'Check the postcode.';
  if (!name) errors.name = 'Type the buyer\'s name.';
  if (!phone.ok || !phone.value) errors.phone = 'Their mobile, 11 digits, so they get their page.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Their email, for the report.';
  const reason = REASONS[b.reason] ? b.reason : 'other', access = ACCESS[b.access] ? b.access : 'agent';
  const contact = clean(b.contact, 120);
  if (access !== 'agent' && !contact) errors.contact = 'Their name and number, so we can arrange it.';
  if (Object.keys(errors).length) return { errors };
  /* The same buyer already booked at this property: their survey, never a second one (lib/booked-already.js). */
  const already = await bookedAlready({ site: a.site, postcode, phone: phone.value, email });
  if (already) return { already };
  const notes = [`Booked by ${who(a)} on their agent page.`, `Why: ${REASONS[reason]}.`, `Access: ${ACCESS[access]}${contact ? ': ' + contact : ''}.`,
    clean(b.note, 600) ? `Note: ${clean(b.note, 600)}` : ''].filter(Boolean).join('\n');
  const sessionId = randomUUID();
  const row = await queryOne(
    `insert into leads (stage, site, session_id, first_name, phone, email, postcode, address_line1, town, issues, role, notes, source_path, referred_by, estate_agent_id, utm)
     values ('complete', $1, $2::uuid, $3, $4, $5, $6, $7, $8, '{}', 'Buying the property', $9, '/agent', $10, $11, $12::jsonb)
     returning id, first_name, phone, postcode, issues, site`,
    [a.site, sessionId, name, phone.value, email, postcode, line1, town, notes, a.id, access === 'agent' ? a.id : null, JSON.stringify({ source: 'agent', ag: String(a.id) })]);
  const id = Number(row.id);
  /* Who lets us in, for the agent's own card once it is booked (lib/agent-job-view.js). */
  await query('update leads set agent_access = $2, access_name = $3 where id = $1', [id, access, access === 'agent' ? null : contact]);
  await query(`update leads set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [id, JSON.stringify([{ at: new Date().toISOString(), by: a.name, how: 'note', note: `Booked by ${who(a)} on their agent page. ${REASONS[reason]}.` }])]);
  try { await mergeDuplicates(id); } catch (err) { console.warn('agent book merge failed:', err.message); }
  await notify({ ...enquiryAlert(a.site, id, row), title: `New enquiry from ${a.name}: ${brandName(a.site)}` });
  await textOwners(enquiryText(a.site, id, row).replace(' enquiry: ', ` enquiry from ${a.name}: `));
  await sendLeadEmail({ site: a.site, stage: 'complete', id, value: { stage: 'complete', firstName: name, email, phone: phone.value, postcode,
    addressLine1: line1, town, issues: [], notes, files: [], sourcePath: '/agent' } }).catch(() => {});
  /* The buyer's thanks waits ten minutes: a time booked meanwhile makes it unneeded. */
  try { await queueText({ kind: 'enquiry', site: a.site, leadId: id, key: 'enquiry', delayMs: 10 * 60000 }); } catch (err) { console.warn('agent book text failed:', err.message); }
  /* Whether the buyer gets texts: a mobile of their own, not the agency's number (lib/texts.js stops those). */
  const texts = /^07\d{9}$/.test(phone.value) && digitsOf(phone.value) !== digitsOf(a.phone);
  return { leadId: id, sessionId, texts, name };
}

/** The agent confirms the time we proposed for access: the wait is cleared and the buyer's booked text goes. */
export async function confirmAccess(a, jobId) {
  const j = await agentJob(Number(a.id), a.site, jobId);
  if (!j || !j.awaiting_agent || !j.date_set) return { error: 'not_waiting' };
  const scope = { personId: null, name: a.name, isAdmin: true, businesses: [a.site], levels: {} };
  const out = await callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id: Number(j.id), awaitingAgent: false } });
  if (out.status >= 400) return { error: 'failed' };
  await query(`update jobs set agent_ask = null, sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: a.name, how: 'note', note: `${who(a)} confirmed access on their agent page.` }])]);
  await flushDue({ limit: 3 }).catch(() => {});
  return { ok: true };
}

/** Another time asked for (a request, never a change): a to-do, an alert and an owners' text. */
export async function askAnother(a, jobId, { note }) {
  const j = await agentJob(Number(a.id), a.site, jobId);
  if (!j || ['cancelled', 'declined'].includes(j.status)) return { error: 'not_found' };
  const words = clean(note, 300);
  if (!words) return { error: 'say_when' };
  await query(`update jobs set agent_ask = $2::jsonb, sched_log = coalesce(sched_log, '[]'::jsonb) || $3::jsonb where id = $1`,
    [j.id, JSON.stringify({ note: words, at: new Date().toISOString() }), JSON.stringify([{ at: new Date().toISOString(), by: a.name, how: 'note', note: `${who(a)} asked for another time: ${words}` }])]);
  await query(`update todos set done_at = now() where job_id = $1 and done_at is null and set_by_name = 'Agent page'`, [j.id]);
  await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Agent page', 'manual', true)`,
    [j.site, j.id, `${a.name} asked for another time for ${customer(j.customer_name, j.customer_postcode)}: "${words}". Move it on the job card, then tick Awaiting estate agent off.`]);
  await notify({ business: j.site, kind: 'portal_move', ref: Number(j.id), tags: 'calendar', priority: 4, path: jobPage(j.site, j.id),
    title: `${a.name} asked for another time`, message: `${customer(j.customer_name, j.customer_postcode)}: ${words.slice(0, 120)}` });
  await textOwners(`${brandName(j.site)}: ${a.name} asked for another time for ${customer(j.customer_name, j.customer_postcode)}: "${words.slice(0, 200)}".${call(a.phone)} ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true };
}
