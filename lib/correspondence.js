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
import { setNext, nextFor } from './next-contact.js';
import { KINDS } from './text-words.js';

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
  /* The automatic texts (lib/texts.js): what went, what is waiting and what could not go, with their words, so History is the one record. */
  const leadIds = [lead ? lead.id : null, kind === 'lead' ? id : null].filter(Boolean);
  const sms = (await query(`select kind, status, delivery, body, error, send_after, sent_at, created_by from sms_outbox
      where (job_id = $1 or lead_id = any($2::bigint[])) and (status in ('waiting', 'sent', 'failed', 'off') or error like 'Stopped by%') order by id desc limit 40`,
    [jobId || -1, leadIds])).map((t) => ({ at: t.sent_at || t.send_after, by: t.created_by || null, kind: 'sms', dir: 'out',
    subject: (KINDS[t.kind] || {}).label || (t.kind === 'reply' ? 'Your reply' : t.kind), state: t.status === 'waiting' ? 'waiting' : t.status === 'off' ? 'off' : t.status === 'cancelled' ? 'stopped' : t.status === 'failed' || ['failed', 'undelivered'].includes(t.delivery) ? 'failed' : t.delivery === 'delivered' ? 'delivered' : 'sent',
    body: t.body || null, text: ['failed', 'cancelled'].includes(t.status) ? t.error : null }));
  /* Every email read whole by the brain (lib/mail-brain.js); the inbox scan's one-line note for the same email steps aside. */
  const mails = (await query(`select at, dir, from_addr, subject, body, attachments from mail_items where job_id = $1 or lead_id = any($2::bigint[]) order by at desc limit 60`,
    [jobId || -1, leadIds]).catch(() => [])).map((m) => ({ at: m.at, by: m.dir === 'in' ? m.from_addr : 'Us', kind: 'email', dir: m.dir, subject: subjectOf(m.subject, m.body),
    body: m.body, text: (m.attachments || []).length ? `Attached: ${m.attachments.map((a) => a.name).join(', ')}` : null }));
  const minute = (at) => new Date(at).toISOString().slice(0, 16);
  const read = new Set(mails.map((m) => minute(m.at)));
  const iso = (x) => ({ ...x, at: new Date(x.at).toISOString() });
  return [...logged.filter((e) => !(e.by === 'Inbox' && read.has(minute(e.at)))), ...acts, ...facts, ...sms, ...mails].map(iso).sort((a, b) => b.at.localeCompare(a.at));
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
  /* Theirs is a reply due today; ours waits two working days (lib/next-contact.js). Only the newest email sets it. */
  const latest = !(row.sched_log || []).some((e) => e.how === 'email' && e.at > when);
  if (latest) await setNext(kind, id, nextFor(entry, undefined));
  return { ok: true };
}

/** Takes an email filed on the wrong card back off it (the subject and when it was sent identify it). */
export async function removeEmail(kind, id, { subject, at }) {
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
  const row = await queryOne(`select sched_log from ${TABLE[kind]} where id = $1`, [id]);
  if (!row || !when) return { removed: 0 };
  const subj = String(subject || '').trim();
  const keep = (row.sched_log || []).filter((e) => !(e.how === 'email' && e.at === when && (!subj || e.subject === subj)));
  const removed = (row.sched_log || []).length - keep.length;
  if (removed) await query(`update ${TABLE[kind]} set sched_log = $2::jsonb where id = $1`, [id, JSON.stringify(keep)]);
  return { removed };
}
