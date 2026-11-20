/**
 * The growth plan (the owner, 20 Nov 2026: seven surveyors at ten a week): four
 * phases, each with its weekly target and how many surveyors it should take,
 * against the surveys actually done week by week; each surveyor's load against
 * ten a week; and the hire signal, when the busiest surveyor has done more than
 * eight in each of the last four full weeks (hire as the demand arrives, never
 * ahead of it). Shown at the top of Company, Growth, on Overview when it is
 * time to hire, and to the board through growth_view.
 */
import { query } from './db.js';

/* The owners' plan: dates the phase ends, its weekly target and its surveyors. One edit to change. */
export const PHASES = [
  { n: 1, until: '2027-03-31', target: 20, surveyors: 3, say: 'Ads back, 15 estate agents, reviews, a price rise' },
  { n: 2, until: '2027-11-30', target: 30, surveyors: 4, say: 'A fourth surveyor; lettings agents, landlords, brokers' },
  { n: 3, until: '2028-12-31', target: 50, surveyors: 6, say: 'A new area; housing associations; an office helper' },
  { n: 4, until: '2029-12-31', target: 70, surveyors: 7, say: 'Seven surveyors at ten a week each' }
];
export const PER_SURVEYOR = 10;
export const HIRE_AT = 8;
const DAMP = ['dampscan', 'ati-london'];
const DAY = 86400000;
const at = (d) => Date.parse(d + 'T12:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** The Monday a London day's week starts on. Pure. */
export function mondayOf(day) {
  const d = new Date(at(day));
  return iso(at(day) - ((d.getUTCDay() + 6) % 7) * DAY);
}

/** The phase a day is in (the last one once the plan has run out). Pure. */
export const phaseOf = (day) => PHASES.find((p) => day <= p.until) || PHASES[PHASES.length - 1];

/** Hire when the busiest surveyor did more than HIRE_AT in every one of the last four full weeks. Pure. */
export function hireSignal(loads) {
  const busy = loads.filter((l) => l.weeks.length >= 4 && l.weeks.slice(-4).every((n) => n > HIRE_AT));
  return busy.length ? { now: true, who: busy.map((l) => l.name), say: `${busy.map((l) => l.name).join(' and ')} over ${HIRE_AT} a week for four weeks` } : { now: false };
}

export async function growthPlan({ today = london(new Date()), weeks = 8 } = {}) {
  const thisMon = mondayOf(today);
  const from = iso(at(thisMon) - weeks * 7 * DAY);
  const rows = await query(`select job_date::text as day, lower(coalesce(surveyor, '')) as who from jobs
     where site = any($1::text[]) and date_set and status not in ('cancelled', 'declined', 'quoted')
       and job_date >= $2::date and job_date < $3::date + 7`, [DAMP, from, thisMon]).catch(() => []);
  const starts = Array.from({ length: weeks + 1 }, (_, i) => iso(at(from) + i * 7 * DAY));
  const inWeek = (r, s) => r.day >= s && r.day < iso(at(s) + 7 * DAY);
  /* Full weeks only for the averages; this week so far and booked are shown apart. */
  const full = starts.slice(0, -1);
  const series = starts.map((s) => ({ week: s, surveys: rows.filter((r) => inWeek(r, s)).length, current: s === thisMon }));
  const names = [...new Set(rows.map((r) => r.who).filter(Boolean))];
  const loads = names.map((who) => {
    const w = full.map((s) => rows.filter((r) => r.who === who && inWeek(r, s)).length);
    const last4 = w.slice(-4);
    return { key: who, name: who.charAt(0).toUpperCase() + who.slice(1), weeks: w, avg: Math.round((last4.reduce((t, n) => t + n, 0) / 4) * 10) / 10, thisWeek: rows.filter((r) => r.who === who && inWeek(r, thisMon)).length };
  }).sort((a, b) => b.avg - a.avg);
  const phase = phaseOf(today);
  const last4 = full.slice(-4).map((s) => rows.filter((r) => inWeek(r, s)).length);
  const avg = Math.round((last4.reduce((t, n) => t + n, 0) / 4) * 10) / 10;
  return {
    today, phase, phases: PHASES, perSurveyor: PER_SURVEYOR, hireAt: HIRE_AT,
    weeks: series, avg, onTrack: avg >= phase.target, gap: Math.max(0, Math.round((phase.target - avg) * 10) / 10),
    capacity: loads.length * PER_SURVEYOR, loads, hire: hireSignal(loads)
  };
}
