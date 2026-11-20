/**
 * The growth plan (the owner, 20 Nov 2026: seven surveyors at ten a week, and
 * "we can't limit ourselves"): milestones of surveys a week with no deadlines,
 * each reached the week the four-week average first gets there, the next one
 * starting at once; the surveys actually done week by week; each surveyor's load against
 * ten a week; and the hire signal, when the busiest surveyor has done more than
 * eight in each of the last four full weeks (hire as the demand arrives, never
 * ahead of it). Shown at the top of Company, Growth, on Overview when it is
 * time to hire, and to the board through growth_view.
 */
import { query } from './db.js';

/* The owners' milestones: surveys a week and the surveyors it takes, never a date. One edit to change. */
export const MILESTONES = [
  { n: 1, target: 20, surveyors: 3, say: 'Fill the three surveyors: new South East brands, Ads, estate agents, reviews' },
  { n: 2, target: 30, surveyors: 4, say: 'A fourth surveyor; lettings agents, landlords, brokers' },
  { n: 3, target: 50, surveyors: 6, say: 'Regional brands earning; partners; an office helper' },
  { n: 4, target: 70, surveyors: 7, say: 'Seven surveyors at ten a week each' },
  { n: 5, target: 100, surveyors: 10, say: 'National: own surveyors in the busiest regions' }
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

/**
 * When each milestone was reached: the first full week whose four-week average met
 * its target. counts is [{ week, surveys }] oldest first. Pure.
 */
export function reached(counts) {
  return MILESTONES.map((m) => {
    const i = counts.findIndex((c, k) => k >= 3 && counts.slice(k - 3, k + 1).reduce((t, x) => t + x.surveys, 0) / 4 >= m.target);
    return { ...m, reached: i < 0 ? null : counts[i].week };
  });
}

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
  const last4 = full.slice(-4).map((s) => rows.filter((r) => inWeek(r, s)).length);
  const avg = Math.round((last4.reduce((t, n) => t + n, 0) / 4) * 10) / 10;
  /* Every full week ever, for when each milestone was first reached. */
  const all = await query(`select date_trunc('week', job_date)::date::text as week, count(*)::int as n from jobs
     where site = any($1::text[]) and date_set and status not in ('cancelled', 'declined', 'quoted') and job_date < $2::date
     group by 1 order by 1`, [DAMP, thisMon]).catch(() => []);
  const counts = [];
  if (all.length) for (let w = all[0].week; w < thisMon; w = iso(at(w) + 7 * DAY)) counts.push({ week: w, surveys: Number((all.find((r) => r.week === w) || {}).n || 0) });
  const milestones = reached(counts);
  const next = milestones.find((m) => !m.reached) || null;
  const last = [...milestones].reverse().find((m) => m.reached) || null;
  return {
    today, next, last, milestones, perSurveyor: PER_SURVEYOR, hireAt: HIRE_AT,
    weeks: series, avg, target: next ? next.target : last.target, gap: next ? Math.max(0, Math.round((next.target - avg) * 10) / 10) : 0,
    capacity: loads.length * PER_SURVEYOR, loads, hire: hireSignal(loads)
  };
}
