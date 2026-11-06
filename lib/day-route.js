/**
 * The drives on a day sheet: from home to the first survey, between each, and
 * home again, the same reckoning as the evening route check (lib/route-check.js),
 * so the van and the 17:00 message agree. Each survey gets `driveMin` (to it)
 * and the day gets `homeBy` (about when they are back), when the surveyor has
 * a home area set and every survey that day has one surveyor.
 */
import { query } from './db.js';
import { places, driveMinutes, tidy, SURVEY_MIN } from './travel.js';
import { homeOf } from './homes.js';

const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export async function withDrives(surveys) {
  if (!surveys.length) return { surveys, homeBy: null };
  const who = new Set(surveys.map((s) => String(s.surveyor || '').toLowerCase()));
  /* Every surveyor mixed together has no one route to draw. */
  if (who.size !== 1) return { surveys, homeBy: null };
  const home = homeOf([...who][0]);
  const where = await places(surveys.map((s) => s.postcode));
  const mins = new Map((await query(`select j.id, coalesce(r.duration_min, $2) as minutes from jobs j left join job_rates r on r.key = j.survey_type
     where j.id = any($1::int[])`, [surveys.map((s) => Number(s.id)), SURVEY_MIN])).map((r) => [Number(r.id), Number(r.minutes)]));
  let prev = home ? { at: home, end: null } : null;
  const out = surveys.map((s, i) => {
    const at = where.get(tidy(s.postcode)) || null;
    const driveMin = prev && prev.at && at ? driveMinutes(prev.at, at) : null;
    if (s.time) prev = { at, end: toMin(s.time) + (mins.get(Number(s.id)) || SURVEY_MIN) };
    return { ...s, driveMin, fromHome: i === 0 && Boolean(home) && driveMin != null };
  });
  const homeBy = home && prev && prev.at && prev.end != null ? fromMin(prev.end + driveMinutes(prev.at, home)) : null;
  return { surveys: out, homeBy };
}
