/**
 * Company, Week: the Monday briefing (the owner, 16 Nov 2026). One screen for
 * the week: Needs you now from Overview first, then last week (Monday to
 * Sunday) against the week before it (enquiries, booked, surveys done, money
 * in, reports late), Google Ads this month, the week ahead by surveyor with
 * the gaps, and the customers still to book. On a Monday morning one push to
 * whoever runs both damp brands opens it (lib/weekly-summary.js); counts and
 * whole pounds only, never a customer.
 */
import { query, queryOne } from './db.js';
import { surveysDone, splitSettings } from './pay-book.js';
import { overview } from './company-overview.js';
import { growth } from './company-growth.js';
import { REPORT_LATE } from './surveys.js';
import { errorsBetween } from './site-errors.js';

const DAMP = ['dampscan', 'ati-london'];
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
export const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** The Monday of the week holding `day`. */
export const mondayOf = (day) => addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
const pounds = (p) => '£' + Math.round(p / 100).toLocaleString('en-GB');
const SURVEYORS = { tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie', scott: 'Scott' };

export async function week({ today = london(new Date()) } = {}) {
  const thisMon = mondayOf(today), lastMon = addDays(thisMon, -7), prevMon = addDays(thisMon, -14), sunday = addDays(thisMon, 6);
  const [surveys, leads, booked, late, diary, toBook, ov, g, problems] = await Promise.all([
    splitSettings().then(surveysDone),
    query(`select (created_at at time zone 'Europe/London')::date::text as d from leads
        where stage = 'complete' and site = any($1::text[]) and created_at >= $2::date and coalesce(closed_reason, '') not like 'Duplicate%'`, [DAMP, prevMon]),
    query(`select (booked_at at time zone 'Europe/London')::date::text as d from jobs
        where site = any($1::text[]) and status not in ('cancelled', 'declined') and booked_at >= $2::date`, [DAMP, prevMon]),
    queryOne(`select count(*)::int as n from jobs j where j.site = any($1::text[]) and j.status in ('booked', 'completed', 'paid') and j.date_set and ${REPORT_LATE}`, [DAMP]),
    query(`select job_date::text as d, surveyor, count(*)::int as n from jobs
        where site = any($1::text[]) and status in ('booked', 'completed', 'paid') and date_set and job_date between $2::date and $3::date group by 1, 2`, [DAMP, thisMon, sunday]),
    queryOne(`select count(*)::int as n, count(*) filter (where pencil_date is not null)::int as held from leads l
        where l.site = any($1::text[]) and l.stage = 'complete' and l.closed_at is null and l.created_at > now() - interval '60 days'
          and not exists (select 1 from jobs j where j.lead_id = l.id)`, [DAMP]),
    overview({ today }),
    growth({ today }),
    errorsBetween(lastMon, addDays(lastMon, 6)).catch(() => 0)
  ]);
  const inWeek = (d, from) => d >= from && d < addDays(from, 7);
  const figures = (from) => {
    /* The company's money only: Revolut catch-up ticks belong to the business before it. */
    const paid = surveys.filter((s) => s.paid && s.book === 'new' && inWeek(s.paidOn, from));
    return {
      enquiries: leads.filter((r) => inWeek(r.d, from)).length,
      booked: booked.filter((r) => inWeek(r.d, from)).length,
      surveys: surveys.filter((s) => inWeek(s.day, from)).length,
      in: paid.reduce((t, s) => t + s.price, 0)
    };
  };
  const last = figures(lastMon), before = figures(prevMon);

  /* The week ahead: each day's surveys by surveyor, so a thin day shows. */
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(thisMon, i), here = diary.filter((r) => r.d === d);
    days.push({ day: d, past: d < today, total: here.reduce((t, r) => t + r.n, 0), by: here.map((r) => ({ who: SURVEYORS[r.surveyor] || 'Not given', n: r.n })) });
  }
  const ads = g.googleAds.month;
  return {
    today, from: lastMon, to: addDays(lastMon, 6), thisMon,
    attention: ov.attention, last, before, reportsLate: late.n, problems,
    ads: { spend: ads.spend, enquiries: ads.enquiries, booked: ads.booked, perBooked: ads.perBooked, money: ads.money },
    ahead: { days, total: days.reduce((t, d) => t + d.total, 0) },
    toBook: { n: toBook.n, held: toBook.held }
  };
}

/** The push line: last week's figures, the week ahead, anything late. */
export function weekPush(w) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    `Last week ${plural(w.last.enquiries, 'enquiry', 'enquiries')} (${w.before.enquiries} the week before), ${w.last.booked} booked, ${pounds(w.last.in)} in.`,
    `${plural(w.ahead.total, 'survey', 'surveys')} this week, ${w.toBook.n} still to book.`
  ];
  if (w.reportsLate) parts.push(`${plural(w.reportsLate, 'report', 'reports')} late.`);
  if (w.problems) parts.push(`${plural(w.problems, 'website problem', 'website problems')} logged.`);
  if (w.attention.length) parts.push(`${plural(w.attention.length, 'thing needs', 'things need')} you.`);
  return parts.join(' ');
}
