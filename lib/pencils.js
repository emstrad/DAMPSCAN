/**
 * Pencilled times: a time offered to a customer and not yet confirmed. It
 * shows grey on Today and the week, keeps the time off the free list, and
 * lapses after 48 hours, when it drops back to Waiting for time with a to-do.
 * A buyer waiting on their estate agent is held until someone lets it go
 * (the owners' choice): agents take longer than two days.
 *
 * Two customers may be pencilled for the same surveyor near the same time
 * (the owners' choice): both show, tagged as sharing it, and the first to be
 * booked takes it. The other goes back to Waiting with a to-do to offer
 * another time, so nobody is double booked and nobody is forgotten. A hold
 * also goes back when a survey is booked over it from anywhere else, or the
 * surveyor takes the hours away. The website's time picker holds a time the
 * same way, so there is one kind of hold.
 */
import { query } from './db.js';
import { places, blocker, tidy } from './travel.js';

export const HOLD_HOURS = 48;
const TABLE = { lead: 'leads', job: 'jobs' };
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;
const near = (a, b) => a.surveyor === b.surveyor && a.date === b.date && (!a.time || !b.time || Math.abs(toMin(a.time) - toMin(b.time)) < 120);

/* Open pencils only: an enquiry not closed or booked, a job still undated.
   A null "until" is held by hand (a buyer waiting on the agent). */
const LIVE = `
  select 'lead' as kind, l.id, l.site, l.pencil_date::text as date, to_char(l.pencil_time, 'HH24:MI') as time, l.pencil_surveyor as surveyor,
         l.pencil_until as until, l.pencil_by as by, l.pencil_set_at as set_at, l.pencil_forced as forced, l.first_name as name, l.postcode
    from leads l where l.pencil_date is not null and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
  union all
  select 'job', j.id, j.site, j.pencil_date::text, to_char(j.pencil_time, 'HH24:MI'), j.pencil_surveyor, j.pencil_until, j.pencil_by, j.pencil_set_at, j.pencil_forced,
         j.customer_name, j.customer_postcode
    from jobs j where j.pencil_date is not null and j.status = 'booked' and (not j.date_set or j.job_time is null)`;
const HELD = '(until is null or until > now())';

/* Whether the surveyor's own hours still cover the hold. */
async function covered(rows) {
  if (!rows.length) return () => true;
  const hours = await query(`select surveyor, on_date::text as date, to_char(start_time, 'HH24:MI') s, to_char(end_time, 'HH24:MI') e from surveyor_hours
      where on_date = any($1::date[])`, [[...new Set(rows.map((r) => r.date))]]);
  return (p) => hours.some((h) => h.surveyor === p.surveyor && h.date === p.date && toMin(p.time) >= toMin(h.s) && toMin(p.time) + 60 <= toMin(h.e));
}

/** Pencils between two days, each with who else holds it and what is wrong. */
export async function pencilsFor(sites, from, to) {
  const rows = await query(`select * from (${LIVE}) p where site = any($1::text[]) and date::date between $2::date and $3::date and ${HELD}
                             order by date, time`, [sites, from, to]);
  const booked = await query(`select surveyor, job_date::text as date, to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode from jobs
      where job_date between $1::date and $2::date and status in ('booked', 'completed') and date_set and surveyor is not null`, [from, to]);
  const inHours = await covered(rows);
  const where = await places([...rows, ...booked].map((r) => r.postcode));
  return rows.map((p) => ({
    kind: 'pencil', of: p.kind, id: Number(p.id), site: p.site, date: p.date, time: p.time, surveyor: p.surveyor,
    customerName: p.name, postcode: p.postcode, until: p.until, byHand: p.until == null, forced: Boolean(p.forced), by: p.by, setAt: p.set_at,
    sharing: rows.filter((o) => o !== p && near(o, p)).map((o) => o.name || 'another customer'),
    clashesBooked: Boolean(blocker(p.time, where.get(tidy(p.postcode)), booked.filter((b) => b.surveyor === p.surveyor && b.date === p.date), where)),
    outsideHours: !inHours(p)
  }));
}

/** Pencils as taken times, for the free list. */
export async function pencilTimes(sites, from, to) {
  return query(`select surveyor, date, time, postcode from (${LIVE}) p where site = any($1::text[]) and date::date between $2::date and $3::date and ${HELD}`, [sites, from, to]);
}

/**
 * Holds a time. Returns who else holds it, and anyone who pencilled that
 * time in the last ten minutes, so two people on two phones see each other.
 */
export async function setPencil(kind, id, { date, time, surveyor, by = null, byHand = false, forced = false }) {
  await query(`update ${TABLE[kind]} set pencil_date = $2::date, pencil_time = $3::time, pencil_surveyor = $4, pencil_by = $5, pencil_set_at = now(), pencil_forced = $7,
                 pencil_until = case when $6 then null else now() + make_interval(hours => ${HOLD_HOURS}) end, sched_stage = 'waiting' where id = $1`,
    [id, date, time, surveyor, by, byHand, forced]);
  const others = await query(`select name, by, set_at from (${LIVE}) p where surveyor = $1 and date = $2 and ${HELD} and not (kind = $4 and id = $5)
                                and abs(extract(epoch from (time::time - $3::time)) / 60) < 120`, [surveyor, date, time, kind, id]);
  const recent = others.filter((o) => o.set_at && Date.now() - new Date(o.set_at).getTime() < 600000 && o.by && o.by !== by)
    .map((o) => `${o.by} pencilled ${o.name || 'another customer'} at this time ${Math.max(1, Math.round((Date.now() - new Date(o.set_at).getTime()) / 60000))} min ago`);
  return { sharing: others.map((o) => o.name || 'another customer'), recent };
}

export async function clearPencil(kind, id) {
  await query(`update ${TABLE[kind]} set pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null, pencil_by = null, pencil_set_at = null, pencil_forced = false where id = $1`, [id]);
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

/** After a booking: anyone else pencilled into that time goes back to Waiting. */
export async function bumpOthers({ kind, id, surveyor, date, time, bookedName }) {
  const rows = await query(`select * from (${LIVE}) p where surveyor = $1 and date = $2 and ${HELD} and not (kind = $4 and id = $5)
                              and abs(extract(epoch from (time::time - $3::time)) / 60) < 120`, [surveyor, date, time, kind, id]);
  for (const p of rows) await dropBack({ ...p, id: Number(p.id) }, `${nice(date, time)} with ${cap(surveyor)} went to ${bookedName || 'another customer'}.`);
  return rows.map((p) => p.name || 'another customer');
}

/**
 * Hourly: holds past their 48 hours or whose day has come lapse; holds a
 * survey was booked over from elsewhere, or whose hours the surveyor took
 * away, go back too. Each with a to-do saying why.
 */
export async function expirePencils() {
  let n = 0;
  const lapsed = await query(`select * from (${LIVE}) p where until <= now() or date::date <= (now() at time zone 'Europe/London')::date`);
  for (const p of lapsed) { await dropBack({ ...p, id: Number(p.id) }, `the pencilled ${nice(p.date, p.time)} lapsed without a yes.`); n += 1; }
  const live = await pencilsFor(['dampscan', 'ati-london'], '2000-01-01', '2999-12-31');
  for (const p of live) {
    const why = p.clashesBooked ? `${nice(p.date, p.time)} with ${cap(p.surveyor)} was booked for another survey.`
      : p.outsideHours ? `${cap(p.surveyor)} is no longer available ${nice(p.date, p.time)} (My hours changed).` : null;
    if (!why || p.forced) continue;
    await dropBack({ kind: p.of, id: p.id, site: p.site, name: p.customerName, postcode: p.postcode }, why);
    n += 1;
  }
  return n;
}
