/**
 * Everything said and done with a customer before their survey, for the
 * Scheduling card's pop-up: calls, texts, notes and times wanted logged on
 * the board, emails filed in full by ChatGPT (log_email) or found by the
 * inbox scan, and what the team did (pencilled, booked, moved, closed) from
 * the audit trail. Newest first. Today's pop-up stays the basic card; this is
 * the Scheduling view only (the owners' choice).
 */
import { query, queryOne } from './db.js';
import { timelineFor } from './timeline.js';

const TABLE = { lead: 'leads', job: 'jobs' };
const MAX_BODY = 20000;
const money = (p) => `£${(Number(p) / 100).toFixed(2).replace(/\.00$/, '')}`;
/* An email with no subject is named by its first words, never "(no subject)". */
export const subjectOf = (subject, body) => String(subject || '').trim() || String(body || '').trim().split(/\n/)[0].slice(0, 80) || 'Email';
/* Audit rows already shown from the board's own log, so not twice. */
const SKIP = ['sched_log', 'sched_email', 'sched_wanted'];

export async function correspondence(kind, id, scope = null) {
  const row = await queryOne(`select id, sched_log${kind === 'job' ? ', lead_id' : ''} from ${TABLE[kind]} where id = $1`, [id]);
  if (!row) return [];
  /* A job made from an enquiry carries the enquiry's history too. */
  const lead = kind === 'job' && row.lead_id ? await queryOne('select id, sched_log from leads where id = $1', [row.lead_id]) : null;
  const logged = [...(row.sched_log || []), ...((lead && lead.sched_log) || [])].map((e) => ({
    at: e.at, by: e.by || null, kind: e.how || 'note', dir: e.dir || null, subject: e.subject || null, text: e.note || null, body: e.body || null
  }));
  const done = await query(`select a.at, a.actor_name as by, a.action, a.after_json->>'said' as said from audit a
      where ((a.entity = $1 and a.entity_id = $2) or (a.entity = 'lead' and a.entity_id = $3)) and a.after_json ? 'said' and not (a.action = any($4::text[]))
      order by a.at desc limit 60`, [kind, id, lead ? lead.id : (kind === 'lead' ? id : -1), SKIP]);
  const acts = done.map((a) => ({ at: a.at, by: a.by || null, kind: 'action', text: a.said }));
  /* The survey's own facts (deposit, paid, visit, report) from the job, so the
     history shows money and progress without anyone logging them. Staff words
     are left out here: the audit rows above already carry them. */
  const jobId = kind === 'job' ? id : (await queryOne('select id from jobs where lead_id = $1 order by id limit 1', [id]) || {}).id;
  const facts = jobId && scope ? ((await timelineFor(scope, Number(jobId))) || []).filter((e) => !e.said && !/^Enquiry came in/.test(e.what))
    .map((e) => ({ at: e.at, by: e.by || null, kind: 'fact', text: e.what + (e.amountPence ? ` ${money(e.amountPence)}` : '') })) : [];
  const iso = (x) => ({ ...x, at: new Date(x.at).toISOString() });
  return [...logged, ...acts, ...facts].map(iso).sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Files one email on the card, whole: which way it went, subject, when and
 * the words. The same email (subject and time) is only kept once. A reply
 * from us moves a new enquiry to Contacted.
 */
export async function addEmail(kind, id, { dir, subject, body, at, by }) {
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  const subj = subjectOf(subject, body).slice(0, 200);
  const row = await queryOne(`select sched_log from ${TABLE[kind]} where id = $1`, [id]);
  if (!row) return { error: 'not_found' };
  if ((row.sched_log || []).some((e) => e.how === 'email' && e.subject === subj && e.at === when)) return { ok: true, duplicate: true };
  const out = dir === 'out';
  const entry = { at: when, by: by || 'ChatGPT', how: 'email', dir: out ? 'out' : 'in', subject: subj, note: `${out ? 'Emailed them' : 'They emailed'}: ${subj}`,
    body: String(body || '').slice(0, MAX_BODY) || null };
  await query(`update ${TABLE[kind]} set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb,
      sched_stage = case when $3 and coalesce(sched_stage, 'new') = 'new' then 'contacted' else sched_stage end where id = $1`, [id, JSON.stringify([entry]), out]);
  return { ok: true };
}
