/**
 * Closing, reopening and deleting website enquiries, and finding one by the
 * words a person uses ("the Patel one in BR6").
 *
 * An enquiry is open (no job, not closed), converted (a job points at it) or
 * closed (dealt with some other way). Closed ones leave every call-back list
 * and alert but stay on the Leads page, so closing is the safe everyday
 * action; deleting is for spam and duplicates and is for managers only,
 * because the row cannot come back. The staff route (lib/routes/admin/leads.js)
 * and the assistant's tools both come through here, so the scoping and the
 * audit rows are the same however the change arrives.
 */
import { query, queryOne } from './db.js';
import { record } from './audit.js';

export const REASONS = ['booked elsewhere', 'not interested', 'spam', 'duplicate', 'no response', 'other'];
export const STATUSES = ['open', 'closed', 'converted', 'all'];

/** SQL for a lead's status, given the leads alias. Converted wins over closed. */
export const statusSql = (a = 'l') =>
  `case when exists (select 1 from jobs j where j.lead_id = ${a}.id) then 'converted' when ${a}.closed_at is not null then 'closed' else 'open' end`;

const canManage = (scope, site) => scope.isAdmin || (scope.levels || {})[site] === 'manage';

async function leadInScope(scope, id) {
  const lead = Number.isInteger(id) && id > 0 ? await queryOne('select * from leads where id = $1', [id]) : null;
  return lead && scope.businesses.includes(lead.site) ? lead : null;
}

/** A reason as given: one of the usual ones, or the person's own words. */
function cleanReason(reason) {
  const r = String(reason || '').trim().slice(0, 200);
  return r || null;
}

export async function closeLead(scope, id, reason) {
  const lead = await leadInScope(scope, id);
  if (!lead) return { status: 404, error: 'No enquiry with that number in the businesses you hold.' };
  const after = await queryOne(
    `update leads set closed_at = coalesce(closed_at, now()), closed_reason = $2, closed_by = $3
      where id = $1 returning id, closed_at, closed_reason, closed_by`, [id, cleanReason(reason), scope.name || null]);
  await record({ scope, business: lead.site, entity: 'lead', entityId: id, action: 'close',
    before: { closed_at: lead.closed_at, closed_reason: lead.closed_reason, closed_by: lead.closed_by }, after });
  return { lead: after };
}

/**
 * A part-finished damp form put on the Scheduling board so it can be called
 * and booked: it becomes a full enquiry in New, unless the same visit already
 * sent the full form (then that one is the card). Logged in its history.
 */
export async function scheduleLead(scope, id) {
  const lead = await leadInScope(scope, id);
  if (!lead) return { status: 404, error: 'No enquiry with that number in the businesses you hold.' };
  const row = await queryOne('select id, site, stage, session_id from leads where id = $1', [id]);
  if (!['dampscan', 'ati-london'].includes(row.site)) return { error: 'Only ATi and DampScan enquiries go on Scheduling.' };
  if (row.stage === 'complete') return { id };
  const full = await queryOne("select id from leads where session_id = $1 and stage = 'complete'", [row.session_id]);
  if (full) return { id: Number(full.id) };
  const note = { at: new Date().toISOString(), by: scope.name || 'Staff', how: 'note', note: 'Put on Scheduling from a part-finished form.' };
  await query(`update leads set stage = 'complete', sched_stage = 'new', closed_at = null, closed_reason = null,
      sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`, [id, JSON.stringify([note])]);
  await record({ scope, business: row.site, entity: 'lead', entityId: id, action: 'schedule', before: { stage: 'partial' }, after: { stage: 'complete', said: 'Put on Scheduling from a part-finished form' } });
  return { id };
}

export async function reopenLead(scope, id) {
  const lead = await leadInScope(scope, id);
  if (!lead) return { status: 404, error: 'No enquiry with that number in the businesses you hold.' };
  const after = await queryOne(
    'update leads set closed_at = null, closed_reason = null, closed_by = null where id = $1 returning id, closed_at, closed_reason, closed_by', [id]);
  await record({ scope, business: lead.site, entity: 'lead', entityId: id, action: 'reopen',
    before: { closed_at: lead.closed_at, closed_reason: lead.closed_reason, closed_by: lead.closed_by }, after });
  return { lead: after };
}

/* The whole row goes in the audit, so a mistaken delete can be put back by hand. */
export async function deleteLead(scope, id) {
  const lead = await leadInScope(scope, id);
  if (!lead) return { status: 404, error: 'No enquiry with that number in the businesses you hold.' };
  if (!canManage(scope, lead.site)) return { status: 403, error: 'Only a manager of that business can delete an enquiry. Close it instead.' };
  const job = await queryOne('select id from jobs where lead_id = $1 limit 1', [id]);
  if (job) return { status: 409, error: 'A job came from this enquiry, so it cannot be deleted.' };
  await query('delete from leads where id = $1', [id]);
  await record({ scope, business: lead.site, entity: 'lead', entityId: id, action: 'delete', before: lead, after: null });
  return { deleted: id };
}

/**
 * Enquiries matching every word in the name, email, phone or postcode
 * (spaces ignored), newest first, with their status. Completed forms come
 * before half-finished ones so "Sarah" finds her finished enquiry.
 */
export async function findLeads(scope, words, { status = 'all' } = {}) {
  const terms = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  const conds = terms.map((_, i) =>
    `(lower(coalesce(l.first_name, '')) like $${i + 3} or lower(coalesce(l.email, '')) like $${i + 3}
      or replace(coalesce(l.phone, ''), ' ', '') like $${i + 3}
      or replace(lower(coalesce(l.postcode, '')), ' ', '') like $${i + 3})`).join(' and ');
  return query(
    `select * from (
       select l.id, l.site, l.created_at, l.stage, l.first_name, l.email, l.phone, l.postcode, l.closed_reason,
              ${statusSql('l')} as status
         from leads l where l.site = any($1::text[]) and ${conds}) x
      where $2::text = 'all' or x.status = $2::text
      order by (x.stage <> 'complete'), x.created_at desc limit 8`,
    [scope.businesses, STATUSES.includes(status) ? status : 'all', ...terms.map((t) => `%${t.replace(/[%_\\\s]/g, '')}%`)]);
}

/**
 * Words or a number to the one enquiry meant. Returns {id} or {error} with
 * the candidates for the assistant to ask about.
 */
export async function resolveLead(scope, ref, { prefer = 'open' } = {}) {
  const v = String(ref ?? '').trim();
  if (/^\d+$/.test(v)) return { id: Number(v) };
  const found = await findLeads(scope, v);
  const preferred = found.filter((l) => l.status === prefer);
  const pick = preferred.length === 1 ? preferred[0] : found.length === 1 ? found[0] : null;
  if (pick) return { id: Number(pick.id) };
  if (!found.length) return { error: `No enquiry for "${v}" in the businesses you hold. Try the name, email, phone or postcode another way.` };
  return {
    error: 'More than one enquiry matches. Ask the person which one, describing each by name, postcode, business, date and status, then call again with that enquiry\'s id.',
    matches: found.map((l) => ({ id: Number(l.id), name: l.first_name, postcode: l.postcode, email: l.email, business: l.site, date: l.created_at, form: l.stage, status: l.status }))
  };
}
