/**
 * My hours, stored the easy way. Each surveyor has a usual week (weekday
 * windows) that fills every future day by itself, so once it is set nobody
 * types hours again. A day changed by hand (more time, less, or off) is
 * marked set and keeps exactly what was typed; "back to usual" clears it.
 * Everything that reads hours (free times, Who's free, best fit, the day
 * lanes, booking checks) reads them through listHours here.
 */
import { query, queryOne } from './db.js';
import { SURVEYORS } from './splits.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const okWindow = (s, e) => HHMM.test(s || '') && HHMM.test(e || '') && toMin(e) > toMin(s);

/** Hours for each day: hand-set days as typed, every other day from the usual week. */
export async function listHours(surveyor, from, to) {
  const [rows, set, usual] = await Promise.all([
    query(`select id, surveyor, on_date::text as date, to_char(start_time, 'HH24:MI') as start, to_char(end_time, 'HH24:MI') as "end"
             from surveyor_hours where ($1::text is null or surveyor = $1) and on_date between $2::date and $3::date order by on_date, start_time`, [surveyor, from, to]),
    query(`select surveyor, on_date::text as date from surveyor_day_set where ($1::text is null or surveyor = $1) and on_date between $2::date and $3::date`, [surveyor, from, to]),
    query(`select surveyor, weekday, to_char(start_time, 'HH24:MI') as start, to_char(end_time, 'HH24:MI') as "end"
             from surveyor_usual where ($1::text is null or surveyor = $1) order by start_time`, [surveyor])
  ]);
  const handSet = new Set(set.map((s) => s.surveyor + ' ' + s.date));
  const out = rows.map((r) => ({ ...r, source: 'set' }));
  const who = surveyor ? [surveyor] : [...new Set(usual.map((u) => u.surveyor))];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of who) {
      if (handSet.has(s + ' ' + d)) continue;
      for (const u of usual.filter((x) => x.surveyor === s && x.weekday === dow(d))) out.push({ id: null, surveyor: s, date: d, start: u.start, end: u.end, source: 'usual' });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/* Before a day is changed by hand, it takes the usual week's windows as its own. */
async function takeOver(surveyor, date) {
  const was = await queryOne('select 1 from surveyor_day_set where surveyor = $1 and on_date = $2::date', [surveyor, date]);
  if (was) return;
  const usual = await query(`select start_time, end_time from surveyor_usual where surveyor = $1 and weekday = $2`, [surveyor, dow(date)]);
  for (const u of usual) await query('insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ($1, $2::date, $3, $4)', [surveyor, date, u.start_time, u.end_time]);
  await query('insert into surveyor_day_set (surveyor, on_date) values ($1, $2::date) on conflict do nothing', [surveyor, date]);
}

export async function addHours(scope, surveyor, date, start, end) {
  if (!SURVEYORS.includes(surveyor)) return { error: 'Unknown surveyor.' };
  if (!ISO.test(date || '') || !okWindow(start, end)) return { error: 'Give a day and a start before the end.' };
  await takeOver(surveyor, date);
  const row = await queryOne(`insert into surveyor_hours (surveyor, on_date, start_time, end_time, set_by) values ($1, $2::date, $3::time, $4::time, $5) returning id`,
    [surveyor, date, start, end, scope.personId ?? null]);
  return { ok: true, id: Number(row.id) };
}

export async function removeHours(surveyor, id) {
  const gone = await queryOne('delete from surveyor_hours where id = $1 and ($2::text is null or surveyor = $2) returning id', [id, surveyor]);
  return gone ? { ok: true } : { error: 'Not found.' };
}

/** One window off one day, whether it came from the usual week or was typed. */
export async function removeWindow(surveyor, date, start, end) {
  if (!ISO.test(date || '')) return { error: 'Which day?' };
  await takeOver(surveyor, date);
  await query(`delete from surveyor_hours where surveyor = $1 and on_date = $2::date and to_char(start_time, 'HH24:MI') = $3 and to_char(end_time, 'HH24:MI') = $4`, [surveyor, date, start, end]);
  return { ok: true };
}

/**
 * Many days at once: add a window, replace the day with one window, mark
 * them off, or put them back to the usual week.
 */
export async function bulk(scope, surveyor, { dates, action, start, end }) {
  const days = [...new Set((dates || []).filter((d) => ISO.test(d)))].slice(0, 62);
  if (!days.length) return { error: 'Tick at least one day.' };
  if (['add', 'replace'].includes(action) && !okWindow(start, end)) return { error: 'Pick a start before the end.' };
  for (const d of days) {
    if (action === 'usual') {
      await query('delete from surveyor_hours where surveyor = $1 and on_date = $2::date', [surveyor, d]);
      await query('delete from surveyor_day_set where surveyor = $1 and on_date = $2::date', [surveyor, d]);
      continue;
    }
    await takeOver(surveyor, d);
    if (action === 'off' || action === 'replace') await query('delete from surveyor_hours where surveyor = $1 and on_date = $2::date', [surveyor, d]);
    if (action === 'add' || action === 'replace') {
      await query('insert into surveyor_hours (surveyor, on_date, start_time, end_time, set_by) values ($1, $2::date, $3::time, $4::time, $5)', [surveyor, d, start, end, scope.personId ?? null]);
    }
  }
  return { ok: true, days: days.length };
}

export async function usualWeek(surveyor) {
  return query(`select id, weekday, to_char(start_time, 'HH24:MI') as start, to_char(end_time, 'HH24:MI') as "end" from surveyor_usual
                 where surveyor = $1 order by weekday, start_time`, [surveyor]);
}

/** The usual week for some weekdays: windows given replace what was there. */
export async function setUsual(surveyor, weekdays, windows) {
  const wd = [...new Set((weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6))];
  if (!wd.length) return { error: 'Pick at least one day of the week.' };
  const wins = (windows || []).filter((w) => okWindow(w.start, w.end));
  for (const d of wd) {
    await query('delete from surveyor_usual where surveyor = $1 and weekday = $2', [surveyor, d]);
    for (const w of wins) await query('insert into surveyor_usual (surveyor, weekday, start_time, end_time) values ($1, $2, $3::time, $4::time)', [surveyor, d, w.start, w.end]);
  }
  return { ok: true };
}

/**
 * Remembers what someone has been doing: the usual week becomes, for each
 * weekday, the hours of the most recent day of that kind they set by hand
 * in the last eight weeks. Weekdays with no recent example are left alone.
 */
export async function learnUsual(surveyor, today) {
  const rows = await query(`select h.on_date::text as date, to_char(h.start_time, 'HH24:MI') as start, to_char(h.end_time, 'HH24:MI') as "end"
      from surveyor_day_set s left join surveyor_hours h on h.surveyor = s.surveyor and h.on_date = s.on_date
     where s.surveyor = $1 and s.on_date between $2::date - 56 and $2::date + 28 order by s.on_date desc`, [surveyor, today]);
  const learnt = {};
  for (const r of rows) {
    const d = dow(r.date);
    if (learnt[d] && learnt[d].date !== r.date) continue;
    learnt[d] = learnt[d] || { date: r.date, wins: [] };
    if (r.start) learnt[d].wins.push({ start: r.start, end: r.end });
  }
  for (const [d, v] of Object.entries(learnt)) await setUsual(surveyor, [Number(d)], v.wins);
  return { ok: true, weekdays: Object.keys(learnt).length };
}
