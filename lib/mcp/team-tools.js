/**
 * The team's day from the assistant: handing a job to somebody, who is on
 * when, a call with a customer written down, and a visit marked done.
 *
 * Each one goes through what the screens already do where there is such a
 * thing (a note, a date move, a status), and leaves an audit row whose
 * `said` is the sentence catch_up repeats, so the rest of the team hears it.
 */
import { query } from '../db.js';
import { record } from '../audit.js';
import { addTodo, resolvePerson, teamFor } from '../todos.js';
import { customer, day, clock } from '../alert-words.js';
import { SURVEYORS as SURVEYOR_KEYS } from '../splits.js';
import { londonToday } from '../pipeline.js';
import { logContact } from '../scheduling.js';
import { JOB_TOOLS } from './job-tools.js';
import { CLIENT_TOOLS } from './client-tools.js';
import quoted from '../routes/admin/quoted.js';
import { callRoute, read, write, fail, notFound, jobInScope, ID, DATE, TIME } from './shared.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const run = (list, name) => (scope, args) => list.find((t) => t.name === name).run(scope, args);
const addNote = run(JOB_TOOLS, 'add_note');
const moveJob = run(JOB_TOOLS, 'move_job');
const updateClient = run(CLIENT_TOOLS, 'update_client');
const who = (j) => customer(j.customer_name, j.customer_postcode);
const SURVEYORS = { scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function said(scope, job, action, words, group, extra = {}) {
  await record({ scope, business: job.site, entity: 'job', entityId: job.id, action, after: { said: words, group, customer: who(job), ...extra } });
}

async function handover(scope, { id, to, note }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const target = await resolvePerson(scope, to);
  if (target.error) return fail(target.error);
  if (target.everyone) return fail('Hand it to one person by first name.');
  const j = found.job;
  if (target.person) await query('update jobs set assigned_person_id = $2, updated_at = now() where id = $1', [j.id, target.person.id]);
  /* On a damp survey, handing it to a surveyor makes them the surveyor. */
  const key = target.crew || (target.person && target.person.name.trim().split(/\s+/)[0].toLowerCase());
  const damp = j.site === 'dampscan' || j.site === 'ati-london';
  if (damp && SURVEYOR_KEYS.includes(key) && j.surveyor !== key) await query('update jobs set surveyor = $2, updated_at = now() where id = $1', [j.id, key]);
  const address = [j.customer_address, j.customer_postcode].filter(Boolean).join(', ');
  const when = j.job_date ? `${day(new Date(j.job_date).toISOString())}${j.job_time ? ' ' + clock(String(j.job_time)) : ''}` : 'no date yet';
  const crewName = target.crew ? target.crew[0].toUpperCase() + target.crew.slice(1) : null;
  const text = [crewName && `For ${crewName}:`, `Handed over to you: ${j.customer_name || 'customer'}, ${address || 'no address yet'}, ${when}.`, j.customer_phone && `Phone ${j.customer_phone}.`, note].filter(Boolean).join(' ');
  const out = await addTodo(scope, { text, forPersonId: target.person ? target.person.id : null, forOwners: Boolean(target.owners), site: j.site, jobId: Number(j.id), source: 'assistant' });
  if (out.error) return fail(out.error);
  const name = target.person ? target.person.name : crewName || 'the owners';
  await said(scope, j, 'handover', `handed ${who(j)} over to ${name}`, 'bookings');
  return ok({ said: `Handed ${who(j)} to ${name}, ${damp && SURVEYOR_KEYS.includes(key) ? `, now the surveyor` : ''}, with a to-do on ${crewName ? 'the owners\' list for them' : 'their list'}.`, todo: out.todo });
}

/* Damp surveys name their surveyor; other work goes by who it was handed to. */
async function whoIsOn(scope, { from, to, person }) {
  const start = from || londonToday();
  const end = to || start;
  if (![start, end].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) return fail('Dates are YYYY-MM-DD.');
  if (end < start || Date.parse(end) - Date.parse(start) > 31 * 86400000) return fail('Ask for at most a month at a time.');
  const rows = await query(
    `select j.id, j.site, j.surveyor, coalesce(p.name, '') as assigned, j.customer_name, j.customer_postcode, j.job_time::text as job_time,
            (case when j.site_visit_on between $2 and $3 and j.visit_done_at is null then j.site_visit_on else j.job_date end)::text as on_date,
            j.site_visit_on between $2 and $3 and j.visit_done_at is null as visit
       from jobs j left join people p on p.id = j.assigned_person_id
      where j.site = any($1::text[]) and ((j.job_date between $2 and $3 and j.status in ('booked', 'completed') and coalesce(j.date_set, true))
         or (j.site_visit_on between $2 and $3 and j.visit_done_at is null))
      order by on_date, j.job_time nulls last`, [scope.businesses, start, end]);
  const team = (await teamFor(scope)).map((p) => p.name);
  const days = {};
  for (const r of rows) {
    const name = r.assigned || SURVEYORS[r.surveyor] || 'Not handed to anyone';
    if (person && !name.toLowerCase().startsWith(String(person).toLowerCase())) continue;
    ((days[r.on_date] ||= {})[name] ||= []).push({ customer: who(r), business: r.site, time: r.job_time ? clock(r.job_time) : null, what: r.visit ? 'site visit' : 'job' });
  }
  const list = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const on = days[d] || {};
    list.push({ date: d, day: day(d), on, free: team.filter((n) => !on[n] && !(person && !n.toLowerCase().startsWith(String(person).toLowerCase()))) });
  }
  return ok({ days: list, tip: 'Free means nothing booked or handed to them that day; it does not know about holidays.' });
}

async function findLead(scope, words) {
  const terms = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 5);
  if (!terms.length) return [];
  const conds = terms.map((_, i) => `(lower(first_name) like $${i + 2} or replace(lower(postcode), ' ', '') like $${i + 2} or lower(email) like $${i + 2} or replace(coalesce(phone, ''), ' ', '') like $${i + 2})`).join(' and ');
  return query(`select id, site, first_name, postcode, staff_note, created_at from leads where stage = 'complete' and site = any($1::text[]) and ${conds} order by created_at desc limit 5`,
    [scope.businesses, ...terms.map((t) => `%${t.replace(/[%_\\\s]/g, '')}%`)]);
}

async function logCall(scope, { id, enquiry, note, date, time, phone, email, how = 'call' }) {
  const words = String(note || '').trim();
  if (!words) return fail('Say what was said on the call.');
  if (!['call', 'email', 'text'].includes(how)) how = 'call';
  /* The same words on the Scheduling card, so the board shows every contact. */
  const onBoard = (kind, cardId) => logContact(kind, Number(cardId), { at: new Date().toISOString(), by: scope.name || 'Staff', how, note: words.slice(0, 500) });
  const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  if (id == null) {
    const leads = await findLead(scope, enquiry);
    if (leads.length !== 1) return fail(leads.length ? `More than one enquiry matches: ${leads.map((l) => customer(l.first_name, l.postcode)).join('; ')}. Ask which.` : 'No job or enquiry matches. Give the name and/or postcode.');
    const l = leads[0];
    await query('update leads set staff_note = $2, updated_at = now() where id = $1', [l.id, [l.staff_note, `${stamp} ${how}: ${words}`].filter(Boolean).join('\n').slice(-4000)]);
    await onBoard('lead', l.id);
    const c = customer(l.first_name, l.postcode);
    await record({ scope, business: l.site, entity: 'lead', entityId: l.id, action: 'call_logged', after: { said: `logged a call with ${c}`, group: 'other', customer: c } });
    return ok({ said: `Call with ${c} written on the enquiry.`, card: { kind: 'lead', id: Number(l.id) } });
  }
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const done = [];
  const n = await addNote(scope, { id, text: `${how}: ${words}` });
  if (n.status >= 400) return n;
  await onBoard('job', found.job.id);
  done.push('note added');
  if (date || time) { const m = await moveJob(scope, { id, date, time }); if (m.status >= 400) return { ...m, data: { ...m.data, error: `Note saved, but the move failed: ${m.data.error}` } }; done.push('moved'); }
  if (phone || email) { const u = await updateClient(scope, { id, phone, email }); if (u.status < 400) done.push('contact updated'); }
  await said(scope, found.job, 'call_logged', `logged a call with ${who(found.job)}${date || time ? ` and moved it to ${[date, time].filter(Boolean).join(' ')}` : ''}`, date || time ? 'bookings' : 'other');
  return ok({ said: `Call with ${who(found.job)} logged (${done.join(', ')}).` });
}

/** Two working days on from a date, skipping Saturday and Sunday. */
export function workingDaysOn(iso, n = 2) {
  let d = iso;
  while (n > 0) { d = addDays(d, 1); const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return d;
}

async function jobDone(scope, { id, findings, report_due: reportDue }) {
  if (reportDue && !/^\d{4}-\d{2}-\d{2}$/.test(reportDue)) return fail('report_due is YYYY-MM-DD.');
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const j = found.job;
  if (found.business.payout_model === 'damp') {
    await query(`update jobs set status = 'completed', visit_done_at = coalesce(visit_done_at, now()), updated_at = now() where id = $1 and status = 'booked'`, [j.id]);
  } else if (j.status === 'booked') {
    const r = await callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: { op: 'status', id: Number(j.id), status: 'completed' } });
    if (r.status >= 400) return r;
  } else if (j.site_visit_on && !j.visit_done_at) {
    await query('update jobs set visit_done_at = now(), updated_at = now() where id = $1', [j.id]);
  } else if (!['completed', 'paid'].includes(j.status)) return fail(`${who(j)} is ${j.status}, with no visit or booked work to mark done.`);
  if (String(findings || '').trim()) await addNote(scope, { id, text: `findings: ${String(findings).trim()}` });
  const due = reportDue || workingDaysOn(londonToday());
  const out = await addTodo(scope, { text: `Send report for ${who(j)}`, forPersonId: scope.personId, forOwners: scope.personId == null, site: j.site, jobId: Number(j.id), dueOn: due, source: 'assistant' });
  await said(scope, j, 'job_done', `marked the visit done for ${who(j)}`, 'bookings');
  return ok({ said: `Visit for ${who(j)} marked done${findings ? ', findings saved' : ''}, and "Send report" is on your list for ${day(due)}.`, todo: out.todo || null });
}

export const TEAM_TOOLS = [
  write('handover_job', 'Hand over a job', 'Hands a job to a colleague: sets them as the person on it and puts a to-do on their list with the customer, address, date, phone and any note (their phone buzzes).',
    { id: ID, to: { type: 'string', description: 'First name, or "owners".' }, note: { type: 'string' } }, ['id', 'to'], handover, { idempotent: true }),
  read('who_is_on', 'Who is on', 'Who has which jobs and site visits each day (by who the job was handed to, or the surveyor on a damp survey), and who is free. "Who\'s free Thursday?"',
    { from: DATE, to: DATE, person: { type: 'string', description: 'One first name only.' } }, whoIsOn),
  write('log_call', 'Log a call', 'Writes down a call (or, with how, an email or text) with a customer: a dated note on their job (id) or enquiry (enquiry words), also logged on the Scheduling board, and optionally moves the job to a new date or time and corrects the phone or email.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, note: { type: 'string' }, date: DATE, time: TIME, phone: { type: 'string' }, email: { type: 'string' }, how: { type: 'string', enum: ['call', 'email', 'text'] } }, ['note'], logCall),
  write('job_done', 'Visit done', 'Marks today\'s visit done (a damp survey surveyed, a booked Verge or CoolRight job completed, or a site visit done), saves the findings as a note and puts "Send report for" the customer on the person\'s list, due report_due or two working days on.',
    { id: ID, findings: { type: 'string' }, report_due: DATE }, ['id'], jobDone)
];
export { findLead };
