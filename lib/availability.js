/**
 * When a surveyor can be booked. Each surveyor sets their own windows day by
 * day (no window, not available); a free time is a one hour start inside a
 * window that does not clash with a booked survey or a time an enquiry is
 * holding. A survey is taken as one hour plus the drive to and from the
 * next one (lib/travel.js: real travel when the caller's postcode is known,
 * an hour either side when not), and a booked survey with no time blocks that surveyor's whole day, because
 * the hour is not known yet. Nothing inside two days is offered, so the
 * week is settled before a customer picks a time.
 */
import { pencilTimes } from './pencils.js';
import { places, blocker, tidy } from './travel.js';
import { query, queryOne } from './db.js';
import { SURVEYORS } from './splits.js';
import { listHours, addHours } from './hours-store.js';

/* Hours themselves live in lib/hours-store.js (the usual week plus days changed by hand). */
export { listHours, addHours, removeHours } from './hours-store.js';

export const LEAD_DAYS = 2;
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The surveyor key for a signed-in person ("Tom Smith" is tom), or null. */
export const surveyorOf = (scope) => {
  const k = String(scope.name || '').trim().split(/\s+/)[0].toLowerCase();
  return SURVEYORS.includes(k) ? k : null;
};

/** The usual pattern for the next weeks: weekend days and weekday evenings, skipping days already set. */
export async function addUsual(scope, surveyor, from, weeks = 4, weekend = ['09:00', '17:00'], evening = ['17:00', '18:00']) {
  let added = 0;
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(Date.parse(from + 'T12:00:00Z') + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const [s, e] = dow === 0 || dow === 6 ? weekend : evening;
    const has = await queryOne('select 1 from surveyor_hours where surveyor = $1 and on_date = $2::date', [surveyor, iso]);
    if (has) continue;
    await addHours(scope, surveyor, iso, s, e);
    added += 1;
  }
  return { ok: true, added };
}

/**
 * Free one hour starts from two days ahead for `days` days, as
 * [{date, time, surveyor}], earliest first, one per time (the customer
 * picks a time, not a person). perSurveyor keeps every surveyor's free
 * times, for staff answering "when have you got?" on the phone.
 */
export async function freeSlots({ today, days = 21, sites = ['dampscan', 'ati-london'], perSurveyor = false, postcode = null }) {
  const from = new Date(Date.parse(today + 'T12:00:00Z') + LEAD_DAYS * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(from + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const [hours, busy, held] = await Promise.all([
    listHours(null, from, to),
    query(`select surveyor, job_date::text as date, to_char(job_time, 'HH24:MI') as time, customer_postcode as postcode from jobs
            where job_date between $1::date and $2::date and status not in ('cancelled', 'declined') and surveyor is not null`, [from, to]),
    pencilTimes(sites, from, to)
  ]);
  const taken = [...busy, ...held];
  const where = await places([postcode, ...taken.map((t) => t.postcode)]);
  const here = postcode ? where.get(tidy(postcode)) : null;
  const seen = new Set();
  const out = [];
  for (const h of hours) {
    const clash = taken.filter((b) => b.surveyor === h.surveyor && b.date === h.date);
    if (clash.some((b) => !b.time)) continue;
    for (let m = toMin(h.start); m + 60 <= toMin(h.end); m += 60) {
      if (blocker(fromMin(m), here, clash, where)) continue;
      const key = h.date + ' ' + fromMin(m) + (perSurveyor ? ' ' + h.surveyor : '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: h.date, time: fromMin(m), surveyor: h.surveyor });
    }
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function labFlag(key) {
  const r = await queryOne('select enabled from lab_flags where key = $1', [key]);
  return Boolean(r && r.enabled);
}

export async function setLabFlag(key, enabled) {
  await query(`insert into lab_flags (key, enabled) values ($1, $2) on conflict (key) do update set enabled = $2, changed_at = now()`, [key, Boolean(enabled)]);
}
