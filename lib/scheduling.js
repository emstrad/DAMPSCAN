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

export const STAGES = ['new', 'contacted', 'waiting'];
export const DAMP = ['dampscan', 'ati-london'];

/* A buyer's "report needed by" from the booking form's notes (lib book.js). */
const deadlineOf = (notes) => { const m = /needed quickly \(by ([^)]+)\)/.exec(notes || ''); return m ? m[1] : null; };

export async function board(sites, today) {
  const s = sites.filter((x) => DAMP.includes(x));
  const [leads, jobs, slots] = await Promise.all([
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone, l.email, l.notes, l.issues, l.address_line1, l.town,
                  l.sched_stage, l.sched_wanted, l.sched_log, l.slot_at, l.slot_surveyor
             from leads l where l.site = any($1::text[]) and l.stage = 'complete' and l.closed_at is null
              and l.created_at >= now() - interval '60 days' and not exists (select 1 from jobs j where j.lead_id = l.id)
            order by l.created_at desc limit 200`, [s]),
    query(`select j.id, j.site, j.created_at, coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_postcode, l.postcode) as postcode,
                  coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email, j.note, j.surveyor, j.survey_type,
                  j.awaiting_agent, j.sched_stage, j.sched_wanted, j.sched_log, a.name as agent
             from jobs j left join leads l on l.id = j.lead_id left join estate_agents a on a.id = j.estate_agent_id
            where j.site = any($1::text[]) and j.status = 'booked' and (not j.date_set or j.awaiting_agent or j.job_time is null)
            order by j.created_at limit 200`, [s]),
    freeSlots({ today, days: 28, sites: s })
  ]);
  const cards = [
    ...leads.map((l) => ({ kind: 'lead', id: Number(l.id), site: l.site, since: l.created_at, stage: STAGES.includes(l.sched_stage) ? l.sched_stage : 'new',
      name: l.first_name, postcode: l.postcode, phone: l.phone, email: l.email, notes: l.notes, issues: l.issues || [],
      street: [l.address_line1, l.town].filter(Boolean).join(', ') || null, wanted: l.sched_wanted, log: l.sched_log || [],
      deadline: deadlineOf(l.notes), held: l.slot_at ? { at: l.slot_at, surveyor: l.slot_surveyor } : null })),
    ...jobs.map((j) => ({ kind: 'job', id: Number(j.id), site: j.site, since: j.created_at, stage: STAGES.includes(j.sched_stage) && j.sched_stage !== 'new' ? j.sched_stage : 'waiting',
      name: j.name, postcode: j.postcode, phone: j.phone, email: j.email, notes: j.note, surveyor: j.surveyor, surveyType: j.survey_type,
      awaitingAgent: Boolean(j.awaiting_agent), agent: j.agent, wanted: j.sched_wanted, log: j.sched_log || [], deadline: deadlineOf(j.note) }))
  ];
  return { cards, slots };
}

const TABLE = { lead: 'leads', job: 'jobs' };

/** One card's row, inside the person's businesses, or null. */
export async function cardRow(kind, id, sites) {
  if (!TABLE[kind] || !Number.isInteger(id)) return null;
  return queryOne(`select id, site, sched_stage, sched_log from ${TABLE[kind]} where id = $1 and site = any($2::text[])`, [id, sites.filter((x) => DAMP.includes(x))]);
}

export async function moveCard(kind, id, to) {
  await query(`update ${TABLE[kind]} set sched_stage = $2 where id = $1`, [id, to]);
}

/* A call, email, text or note; the first contact moves a new enquiry on. */
export async function logContact(kind, id, entry) {
  await query(`update ${TABLE[kind]} set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb,
                 sched_stage = case when coalesce(sched_stage, 'new') = 'new' then 'contacted' else sched_stage end where id = $1`,
    [id, JSON.stringify([entry])]);
}

export async function setWanted(kind, id, text) {
  await query(`update ${TABLE[kind]} set sched_wanted = $2 where id = $1`, [id, text || null]);
}

/**
 * Why this time does not work for this surveyor, or null: outside the hours
 * they set, or within an hour's travel of a survey they already have.
 */
export async function clashFor(surveyor, date, time, exceptJob = null) {
  const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
  const hours = await query(`select to_char(start_time, 'HH24:MI') s, to_char(end_time, 'HH24:MI') e from surveyor_hours where surveyor = $1 and on_date = $2::date`, [surveyor, date]);
  const inside = hours.some((h) => toMin(time) >= toMin(h.s) && toMin(time) + 60 <= toMin(h.e));
  const busy = await query(`select to_char(job_time, 'HH24:MI') t, coalesce(customer_name, 'another survey') n from jobs
      where surveyor = $1 and job_date = $2::date and status not in ('cancelled', 'declined') and id is distinct from $3`, [surveyor, date, exceptJob]);
  const near = busy.find((b) => !b.t || Math.abs(toMin(b.t) - toMin(time)) < 120);
  if (near) return `${surveyor[0].toUpperCase() + surveyor.slice(1)} already has ${near.n} ${near.t ? 'at ' + near.t : 'that day with no time set'}.`;
  if (!inside) return `${surveyor[0].toUpperCase() + surveyor.slice(1)} has not set hours covering ${time} that day on My hours.`;
  return null;
}
