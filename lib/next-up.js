/**
 * What's next (the owner, 19 Nov 2026: "a clear set of steps for each person";
 * the To-do page becomes "what's going on"): every open ATi and DampScan
 * customer as one row, with whose move it is, the one next step, why and since
 * when, what they owe, whether they are on the old money, the last contact and
 * the to-dos set about them. Worked out from the facts (lib/journey.js stages,
 * the follow-up dates, their page, the texts) so it always matches the cards,
 * then kept in customer_state for ChatGPT and Claude to read the same picture.
 *
 * Lanes: now (needs you now), us (your move), them (waiting on them), agent
 * (waiting on the estate agent), booked (nothing owed, the visit ahead) and
 * cold (gone cold, folded). Verge and CoolRight keep their own to-do items,
 * which join as rows in Your move (lib/work.js).
 */
import { query } from './db.js';
import { jobStage, leadStage } from './journey.js';
import { moneyCols, owedPence } from './money-sql.js';
import { askOf } from './page-asks.js';
import { listTodos } from './todos.js';
import { londonToday } from './pipeline.js';
import { persistState } from './next-up-store.js';

const DAMP = ['dampscan', 'ati-london'];
const HOUR = 3600000;
const pounds = (p) => `£${(Number(p) / 100).toFixed(Number(p) % 100 ? 2 : 0)}`;
const first = (n) => String(n || '').trim().split(/\s+/)[0] || null;
const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const day = (v) => (v == null ? null : iso(v).slice(0, 10));
const niceDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/* The newest history line that was real contact (a call, email or text), and who it was with. */
function lastContact(logs, sms) {
  const all = logs.flat().filter((e) => e && ['call', 'email', 'text'].includes(e.how)).map((e) => ({ how: e.how, at: e.at, by: e.by || null, dir: e.dir || null, note: String(e.note || e.subject || '').slice(0, 120) }));
  if (sms) all.push({ how: 'text', at: iso(sms.sent_at), by: sms.created_by || 'Automatic', dir: 'out', note: String(sms.body || '').slice(0, 120) });
  return all.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
}

/** One job card to its row. */
export function jobRow(j, today = londonToday(), now = Date.now()) {
  const stage = jobStage(j, today);
  if (['Paid', 'Cancelled'].includes(stage)) return null;
  const owed = owedPence(j), old = Boolean(j.texts_off), d = day(j.job_date);
  const row = { key: `job-${j.id}`, kind: 'job', jobId: Number(j.id), leadId: j.lead_id ? Number(j.lead_id) : null, site: j.site, name: j.customer_name, first: first(j.customer_name),
    postcode: j.customer_postcode, phone: j.phone || null, email: j.customer_email || null, stage, owedPence: owed, oldMoney: old, date: d, time: j.job_time ? String(j.job_time).slice(0, 5) : null };
  const ask = askOf({ ...j, day: d });
  const reported = j.report_ready_at || j.survey_sent_at;
  const set = (lane, next, why, since, action) => Object.assign(row, { lane, next, why, since: iso(since), action });
  if (ask && ask.what === 'move') return set('now', `Move them to ${niceDay(ask.date)} at ${String(ask.time).slice(0, 5)}`, 'They asked on their page', ask.at, 'open');
  if (ask) return set('now', 'Reply to their message', `"${ask.text}"`, ask.at, 'open');
  if (j.agent_ask) return set('now', 'The agent asked for another time', `"${String(j.agent_ask.note || '').slice(0, 100)}"`, j.agent_ask.at, 'open');
  if (stage === 'Waiting on agent') return set('agent', 'Waiting on the agent to confirm access', 'Booked with the agent letting us in', j.booked_at || j.created_at, 'open');
  if (stage === 'Pencilled') return set(j.pencil_set_at && now - Date.parse(j.pencil_set_at) > 48 * HOUR ? 'us' : 'them', 'Confirm the held time', `Held ${niceDay(day(j.pencil_date))} at ${String(j.pencil_time || '').slice(0, 5)}`, j.pencil_set_at, 'open');
  if (['Waiting for time', 'Contacted', 'Gone cold'].includes(stage)) {
    const due = j.next_contact_on && day(j.next_contact_on) <= today;
    if (stage === 'Gone cold') return set('cold', 'Try them again', 'Went quiet', j.updated_at, 'open');
    return set(due || !j.next_contact_on ? 'us' : 'them', due ? `Get back to them: ${j.next_contact_why || 'follow up'}` : 'Agree a time and book them in', j.next_contact_on ? `Next contact ${niceDay(day(j.next_contact_on))}` : 'No time agreed yet', j.updated_at, 'book');
  }
  if (stage === 'Booked') {
    if (j.deposit_paid_at || j.paid_at) return set('booked', `Survey ${niceDay(d)}${row.time ? ' at ' + row.time : ''}`, j.paid_at ? 'Paid in full' : 'Deposit in', j.booked_at || j.created_at, 'open');
    const late = (j.booked_at && now - Date.parse(j.booked_at) > 48 * HOUR) || (d && d <= day(new Date(now + 2 * 86400000)));
    return set(late ? 'us' : 'them', late ? 'Chase the deposit' : 'Deposit due', `Survey ${niceDay(d)}, nothing paid yet`, j.booked_at || j.created_at, late ? 'deposit' : 'open');
  }
  if (stage === 'Surveyed') return set('us', 'Write and send the report', `Surveyed ${niceDay(d)}${owed ? `, ${pounds(owed)} still owed` : ''}`, d ? `${d}T17:00:00Z` : j.updated_at, 'report');
  if (stage === 'Report to send') return set('us', 'Send the report', 'Paid in full, report owed', j.paid_at, 'report');
  /* Report sent or ready, balance owed: theirs to pay, ours to chase after three days. */
  const waited = reported && now - Date.parse(reported) > 3 * 24 * HOUR;
  return set(waited ? 'us' : 'them', waited ? `Chase the ${pounds(owed)} balance` : `${pounds(owed)} balance due`, old ? 'Report ready, old money (Revolut)' : 'Report ready, unlocks once paid', reported, 'balance');
}

/** One open enquiry (no survey yet) to its row. */
export function leadRow(l, today = londonToday()) {
  const stage = leadStage(l);
  if (stage === 'Closed') return null;
  const row = { key: `lead-${l.id}`, kind: 'lead', jobId: null, leadId: Number(l.id), site: l.site, name: l.first_name, first: first(l.first_name), postcode: l.postcode,
    phone: l.phone || null, email: l.email || null, stage, owedPence: 0, oldMoney: false, partial: l.stage === 'partial' || Boolean(l.from_partial) };
  const set = (lane, next, why, since, action) => Object.assign(row, { lane, next, why, since: iso(since), action });
  if (stage === 'New') return set(Date.now() - Date.parse(l.created_at) > 2 * HOUR ? 'now' : 'us', row.partial ? 'Call them: didn\'t finish the form' : 'Call them back', (l.issues || []).length ? l.issues.join(', ') : 'New enquiry', l.created_at, 'call');
  if (stage === 'Gone cold') return set('cold', 'Try them again', 'Went quiet', l.updated_at, 'open');
  if (stage === 'Pencilled') return set('them', 'Confirm the held time', `Held ${niceDay(day(l.pencil_date))}`, l.pencil_set_at || l.updated_at, 'open');
  if (l.estate_agent_id && stage === 'Waiting for time') return set('agent', 'Waiting on the agent for a time', 'The agent is arranging access', l.updated_at, 'open');
  const due = l.next_contact_on && day(l.next_contact_on) <= today;
  return set(due ? 'us' : 'them', due ? `Get back to them: ${l.next_contact_why || 'follow up'}` : 'Waiting to hear back', l.next_contact_on ? `Next contact ${niceDay(day(l.next_contact_on))}` : 'No follow-up set', l.updated_at, 'open');
}

/** Every open customer for these sites, with their to-dos and last contact, kept in customer_state. */
export async function nextUp(scope, sites, { persist = true } = {}) {
  const damp = sites.filter((s) => DAMP.includes(s));
  const today = londonToday();
  const [jobs, leads, todos] = await Promise.all([
    damp.length ? query(`select j.*, j.job_date::text as job_date, coalesce(j.customer_phone, l.phone) as phone, l.sched_log as lead_log, ${moneyCols('j')}
        from jobs j left join leads l on l.id = j.lead_id
       where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined', 'refunded')
         and not (j.paid_at is not null and (j.survey_sent_at is not null or j.report_ready_at is not null))`, [damp]) : [],
    damp.length ? query(`select l.* from leads l where l.site = any($1::text[]) and l.closed_at is null
         and not exists (select 1 from jobs j where j.lead_id = l.id)
         and (l.sched_stage is not null or l.pencil_date is not null or l.created_at > now() - interval '60 days')`, [damp]) : [],
    listTodos(scope, 'open', { limit: 300 })
  ]);
  const ids = jobs.map((j) => Number(j.id));
  const sms = ids.length ? await query(`select distinct on (job_id) job_id, sent_at, body, created_by from sms_outbox
      where job_id = any($1::bigint[]) and status = 'sent' order by job_id, sent_at desc`, [ids]) : [];
  const smsBy = new Map(sms.map((s) => [Number(s.job_id), s]));
  const rows = [];
  for (const j of jobs) {
    const r = jobRow(j, today);
    if (!r) continue;
    r.lastContact = lastContact([j.sched_log || [], j.lead_log || []], smsBy.get(Number(j.id)));
    rows.push(r);
  }
  for (const l of leads) { const r = leadRow(l, today); if (r) { r.lastContact = lastContact([l.sched_log || []]); rows.push(r); } }
  const byJob = new Map(rows.filter((r) => r.jobId).map((r) => [r.jobId, r]));
  const byLead = new Map(rows.filter((r) => r.leadId).map((r) => [r.leadId, r]));
  const loose = [];
  for (const t of todos) {
    if (t.site && !sites.includes(t.site)) continue;
    const owner = (t.jobId && byJob.get(Number(t.jobId))) || (t.leadId && byLead.get(Number(t.leadId)));
    const todo = { id: t.id, text: t.text, dueOn: t.dueOn, overdue: t.overdue, forName: t.forName, createdAt: t.createdAt, setBy: t.setBy };
    if (owner) (owner.todos = owner.todos || []).push(todo);
    else loose.push({ ...todo, site: t.site || null, jobId: t.jobId || null, leadId: t.leadId || null, customer: t.customer || t.lead || null });
  }
  /* A to-do that is overdue pulls its customer into Your move, whatever else is waiting. */
  for (const r of rows) {
    r.todos = r.todos || [];
    if (['them', 'booked', 'agent'].includes(r.lane) && r.todos.some((t) => t.overdue)) { r.lane = 'us'; r.why = `To-do overdue: ${r.todos.find((t) => t.overdue).text.slice(0, 80)}`; }
  }
  const order = { now: 0, us: 1, them: 2, agent: 3, booked: 4, cold: 5 };
  rows.sort((a, b) => order[a.lane] - order[b.lane] || String(a.lane === 'booked' ? a.date || '' : a.since || '').localeCompare(String(b.lane === 'booked' ? b.date || '' : b.since || '')));
  if (persist) await persistState(rows, damp).catch((err) => console.warn('customer_state not kept:', err.message));
  const count = (lane) => rows.filter((r) => (lane === 'us' ? ['now', 'us'].includes(r.lane) : r.lane === lane)).length;
  return { today, rows, loose, counts: { us: count('us'), now: count('now'), them: count('them'), agent: count('agent'), booked: count('booked'), cold: count('cold') } };
}

