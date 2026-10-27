/**
 * Pencilled times: a time offered to a customer and not yet confirmed. It
 * shows grey on Today and the week, keeps the time off the free list, and
 * lapses after 48 hours, when it drops back to Waiting for time with a to-do.
 *
 * Two customers may be pencilled for the same surveyor near the same time
 * (the owners' choice): both show, tagged as sharing it, and the first to be
 * booked takes it. The other goes back to Waiting with a to-do to offer
 * another time, so nobody is double booked and nobody is forgotten.
 */
import { query } from './db.js';

export const HOLD_HOURS = 48;
export const GAP_MIN = 120;
const TABLE = { lead: 'leads', job: 'jobs' };
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/* Open pencils only: an enquiry not closed or booked, a job still undated. */
const LIVE = `
  select 'lead' as kind, l.id, l.site, l.pencil_date::text as date, to_char(l.pencil_time, 'HH24:MI') as time, l.pencil_surveyor as surveyor,
         l.pencil_until as until, l.first_name as name, l.postcode
    from leads l where l.pencil_date is not null and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
  union all
  select 'job', j.id, j.site, j.pencil_date::text, to_char(j.pencil_time, 'HH24:MI'), j.pencil_surveyor, j.pencil_until,
         j.customer_name, j.customer_postcode
    from jobs j where j.pencil_date is not null and j.status = 'booked'`;

/** Pencils between two days, each with how many share its time. */
export async function pencilsFor(sites, from, to) {
  const rows = await query(`select * from (${LIVE}) p where site = any($1::text[]) and date::date between $2::date and $3::date and until > now()
                             order by date, time`, [sites, from, to]);
  const booked = await query(`select surveyor, job_date::text as date, to_char(job_time, 'HH24:MI') as time from jobs
      where job_date between $1::date and $2::date and status in ('booked', 'completed') and date_set and surveyor is not null`, [from, to]);
  const near = (a, b) => a.surveyor === b.surveyor && a.date === b.date && (!a.time || !b.time || Math.abs(toMin(a.time) - toMin(b.time)) < GAP_MIN);
  return rows.map((p) => ({
    kind: 'pencil', of: p.kind, id: Number(p.id), site: p.site, date: p.date, time: p.time, surveyor: p.surveyor,
    customerName: p.name, postcode: p.postcode, until: p.until,
    sharing: rows.filter((o) => o !== p && near(o, p)).map((o) => o.name || 'another customer'),
    clashesBooked: booked.some((b) => near(b, p))
  }));
}

/** Pencils as taken times, for the free list. */
export async function pencilTimes(sites, from, to) {
  return query(`select surveyor, date, time from (${LIVE}) p where site = any($1::text[]) and date::date between $2::date and $3::date and until > now()`, [sites, from, to]);
}

export async function setPencil(kind, id, { date, time, surveyor }) {
  await query(`update ${TABLE[kind]} set pencil_date = $2::date, pencil_time = $3::time, pencil_surveyor = $4,
                 pencil_until = now() + make_interval(hours => ${HOLD_HOURS}), sched_stage = 'waiting' where id = $1`, [id, date, time, surveyor]);
  const others = await query(`select name from (${LIVE}) p where surveyor = $1 and date = $2 and until > now() and not (kind = $4 and id = $5)
                                and abs(extract(epoch from (time::time - $3::time)) / 60) < ${GAP_MIN}`, [surveyor, date, time, kind, id]);
  return others.map((o) => o.name || 'another customer');
}

export async function clearPencil(kind, id) {
  await query(`update ${TABLE[kind]} set pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null where id = $1`, [id]);
}

/* Back to Waiting for time, with a note on the card and a to-do for the owners. */
async function dropBack(p, why) {
  await clearPencil(p.kind, p.id);
  const entry = { at: new Date().toISOString(), by: 'Scheduling', how: 'note', note: why };
  await query(`update ${TABLE[p.kind]} set sched_stage = 'waiting', sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`, [p.id, JSON.stringify([entry])]);
  await query(`insert into todos (site, job_id, lead_info, text, for_owners, set_by_name, source) values ($1, $2, $3, $4, true, 'Scheduling', 'manual')`,
    [p.site, p.kind === 'job' ? p.id : null, p.kind === 'lead' ? `${p.name || ''} ${p.postcode || ''}`.trim() : null,
     `Offer ${p.name || 'the customer'}${p.postcode ? ' (' + p.postcode.split(' ')[0] + ')' : ''} another time: ${why}`]);
}

/** After a booking: anyone else pencilled near that time goes back to Waiting. */
export async function bumpOthers({ kind, id, surveyor, date, time, bookedName }) {
  const rows = await query(`select * from (${LIVE}) p where surveyor = $1 and date = $2 and not (kind = $4 and id = $5)
                              and abs(extract(epoch from (time::time - $3::time)) / 60) < ${GAP_MIN}`, [surveyor, date, time, kind, id]);
  for (const p of rows) await dropBack({ ...p, id: Number(p.id) }, `${nice(date, time)} with ${cap(surveyor)} went to ${bookedName || 'another customer'}.`);
  return rows.map((p) => p.name || 'another customer');
}

/** Hourly: pencils past their 48 hours, or whose day has come, lapse. */
export async function expirePencils() {
  const rows = await query(`select * from (${LIVE}) p where until <= now() or date::date <= (now() at time zone 'Europe/London')::date`);
  for (const p of rows) await dropBack({ ...p, id: Number(p.id) }, `the pencilled ${nice(p.date, p.time)} lapsed without a yes.`);
  return rows.length;
}
