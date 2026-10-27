/**
 * Scheduling: everything before a damp survey is booked, in one board.
 *
 *   New enquiry       a website enquiry nobody has acted on
 *   Contacted         called, emailed or texted; the log says how and what
 *   Waiting for time  they want it, the time is not fixed yet
 *   Booked            fixed: it is a job with a date and time, and from there
 *                     it is on Today, the week and the Surveys board
 *
 * Any stage can be skipped. A job made without a date (by phone or the
 * assistant) starts in Waiting for time. Suggested times come from the
 * surveyors' own hours (lib/availability.js), so the board never offers a
 * time nobody can do or one that clashes with a booked survey.
 */
import { query, queryOne } from './db.js';
import { freeSlots } from './availability.js';
import { places, blocker, tidy } from './travel.js';

export const STAGES = ['new', 'contacted', 'waiting'];
export const DAMP = ['dampscan', 'ati-london'];

/* A buyer's "report needed by" from the booking form's notes (lib book.js). */
const deadlineOf = (notes) => { const m = /needed quickly \(by ([^)]+)\)/.exec(notes || ''); return m ? m[1] : null; };

const PENCIL = (t) => `${t}.pencil_date::text as pencil_date, to_char(${t}.pencil_time, 'HH24:MI') as pencil_time, ${t}.pencil_surveyor, ${t}.pencil_until,
  ${t}.pencil_by, ${t}.pencil_set_at`;
/* A null "until" is a hold kept by hand (a buyer waiting on the agent). */
const pencilOf = (r) => (r.pencil_date && (r.pencil_until == null || new Date(r.pencil_until) > new Date())
  ? { date: r.pencil_date, time: r.pencil_time, surveyor: r.pencil_surveyor, until: r.pencil_until, byHand: r.pencil_until == null, by: r.pencil_by, setAt: r.pencil_set_at } : null);
const digits = (p) => String(p || '').replace(/\D/g, '').replace(/^44/, '0');
const pc = (p) => String(p || '').toUpperCase().replace(/\s+/g, '');
/* The same person on two cards: email, phone, or first name and postcode. */
const samePerson = (a, b) => a.site === b.site && ((a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase())
  || (digits(a.phone).length > 6 && digits(a.phone) === digits(b.phone))
  || (pc(a.postcode) && pc(a.postcode) === pc(b.postcode) && String(a.name || '').trim().split(' ')[0].toLowerCase() === String(b.name || '').trim().split(' ')[0].toLowerCase()));

export async function board(sites, today) {
  const s = sites.filter((x) => DAMP.includes(x));
  const [leads, jobs, slots] = await Promise.all([
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone, l.email, l.notes, l.issues, l.address_line1, l.town,
                  l.sched_stage, l.sched_wanted, l.sched_log, ${PENCIL('l')}
             from leads l where l.site = any($1::text[]) and l.stage = 'complete' and l.closed_at is null
              and l.created_at >= now() - interval '60 days' and not exists (select 1 from jobs j where j.lead_id = l.id)
            order by l.created_at desc limit 200`, [s]),
    query(`select j.id, j.site, j.created_at, coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_postcode, l.postcode) as postcode,
                  coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email, j.note, j.surveyor, j.survey_type,
                  j.awaiting_agent, j.sched_stage, j.sched_wanted, j.sched_log, a.name as agent, ${PENCIL('j')}
             from jobs j left join leads l on l.id = j.lead_id left join estate_agents a on a.id = j.estate_agent_id
            where j.site = any($1::text[]) and j.status = 'booked' and (not j.date_set or j.awaiting_agent or j.job_time is null)
            order by j.created_at limit 200`, [s]),
    freeSlots({ today, days: 28, sites: s })
  ]);
  const cards = [
    ...leads.map((l) => ({ kind: 'lead', id: Number(l.id), site: l.site, since: l.created_at, stage: STAGES.includes(l.sched_stage) ? l.sched_stage : 'new',
      name: l.first_name, postcode: l.postcode, phone: l.phone, email: l.email, notes: l.notes, issues: l.issues || [],
      street: [l.address_line1, l.town].filter(Boolean).join(', ') || null, wanted: l.sched_wanted, log: l.sched_log || [],
      deadline: deadlineOf(l.notes), pencil: pencilOf(l) })),
    ...jobs.map((j) => ({ kind: 'job', id: Number(j.id), site: j.site, since: j.created_at, stage: STAGES.includes(j.sched_stage) && j.sched_stage !== 'new' ? j.sched_stage : 'waiting',
      name: j.name, postcode: j.postcode, phone: j.phone, email: j.email, notes: j.note, surveyor: j.surveyor, surveyType: j.survey_type,
      awaitingAgent: Boolean(j.awaiting_agent), agent: j.agent, wanted: j.sched_wanted, log: j.sched_log || [], deadline: deadlineOf(j.note), pencil: pencilOf(j) }))
  ];
  /* Who else holds a card's pencilled time, so the board shows the clash too. */
  for (const c of cards) {
    if (!c.pencil) continue;
    c.pencil.sharing = cards.filter((o) => o !== c && o.pencil && o.pencil.surveyor === c.pencil.surveyor && o.pencil.date === c.pencil.date
      && Math.abs(toMin(o.pencil.time) - toMin(c.pencil.time)) < 120).map((o) => o.name || 'another customer');
  }
  for (const c of cards) c.same = cards.filter((o) => o !== c && samePerson(c, o)).map((o) => ({ kind: o.kind, id: o.id, name: o.name, postcode: o.postcode }));
  return { cards, slots };
}

const TABLE = { lead: 'leads', job: 'jobs' };
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };

/** One card's row, inside the person's businesses, or null. */
export async function cardRow(kind, id, sites) {
  if (!TABLE[kind] || !Number.isInteger(id)) return null;
  return queryOne(`select id, site, sched_stage, sched_log from ${TABLE[kind]} where id = $1 and site = any($2::text[])`, [id, sites.filter((x) => DAMP.includes(x))]);
}

export async function moveCard(kind, id, to) {
  await query(`update ${TABLE[kind]} set sched_stage = $2 where id = $1`, [id, to]);
}

/* A call, email, text or note; the first contact moves a new enquiry on. */
export async function logContact(kind, id, entry, { moveOn = true } = {}) {
  await query(`update ${TABLE[kind]} set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb,
                 sched_stage = case when $3 and coalesce(sched_stage, 'new') = 'new' then 'contacted' else sched_stage end where id = $1`,
    [id, JSON.stringify([entry]), moveOn]);
}

export async function setWanted(kind, id, text) {
  await query(`update ${TABLE[kind]} set sched_wanted = $2 where id = $1`, [id, text || null]);
}

/**
 * Why this time does not work for this surveyor, or null: outside the hours
 * they set, or inside the drive to or from a survey they already have
 * (lib/travel.js, from the postcodes; an hour each way when unknown).
 */
export async function clashFor(surveyor, date, time, exceptJob = null, postcode = null) {
  const who = surveyor[0].toUpperCase() + surveyor.slice(1);
  const hours = await query(`select to_char(start_time, 'HH24:MI') s, to_char(end_time, 'HH24:MI') e from surveyor_hours where surveyor = $1 and on_date = $2::date`, [surveyor, date]);
  const inside = hours.some((h) => toMin(time) >= toMin(h.s) && toMin(time) + 60 <= toMin(h.e));
  const busy = await query(`select to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode, coalesce(customer_name, 'another survey') as name from jobs
      where surveyor = $1 and job_date = $2::date and date_set and status not in ('cancelled', 'declined') and id is distinct from $3`, [surveyor, date, exceptJob]);
  const where = await places([postcode, ...busy.map((b) => b.postcode)]);
  const hit = blocker(time, postcode ? where.get(tidy(postcode)) : null, busy, where);
  if (hit && hit.why === 'untimed') return `${who} already has ${hit.name} that day with no time set.`;
  if (hit) return `${who} has ${hit.name} at ${hit.time}${hit.postcode ? ' in ' + hit.postcode : ''}: with the survey and about ${hit.drive} minutes' drive, that does not fit.`;
  if (!inside) return `${who} has not set hours covering ${time} that day on My hours.`;
  return null;
}
