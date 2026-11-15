/**
 * Company, Overview (the owners' plan, 15 Nov 2026): the running of the
 * business on one screen, urgent first. What needs an owner now (people owed,
 * the tax pot short, money to collect, a salary or the ad spend not logged,
 * the VAT threshold close), then this month against last, what is booked
 * ahead, and where the company year is heading. Everything is worked out from
 * the same figures as Pay and Money (lib/pay-book.js, lib/company-money.js).
 */
import { query, queryOne } from './db.js';
import { payBook, surveysDone, splitSettings } from './pay-book.js';
import { moneyView, corpTax, yearStart } from './company-money.js';

const DAMP = ['dampscan', 'ati-london'];
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const monthStart = (day, back = 0) => { const d = new Date(day.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
const monthName = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const pounds = (p) => '£' + Math.round(p / 100).toLocaleString('en-GB');

export async function overview({ today = london(new Date()) } = {}) {
  const m0 = monthStart(today), m1 = monthStart(today, 1);
  const lastEnd = new Date(Date.parse(m0 + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const [book, now, last, surveys, ahead, enquiries, logged] = await Promise.all([
    payBook(),
    moneyView({ from: m0, today }),
    moneyView({ from: m1, to: lastEnd, today }),
    splitSettings().then(surveysDone),
    queryOne(`select count(*)::int as n, coalesce(sum(survey_price_pence), 0)::bigint as pence,
        count(*) filter (where job_date < $2::date)::int as this_month, coalesce(sum(survey_price_pence) filter (where job_date < $2::date), 0)::bigint as this_month_pence
        from jobs where site = any($1::text[]) and status = 'booked' and date_set and job_date >= (now() at time zone 'Europe/London')::date`, [DAMP, monthStart(today, -1)]),
    query(`select to_char(l.created_at at time zone 'Europe/London', 'YYYY-MM') as m, count(*)::int as n,
        count(j.id) filter (where j.status not in ('cancelled', 'declined'))::int as booked
        from leads l left join lateral (select id, status from jobs where lead_id = l.id order by id limit 1) j on true
       where l.stage = 'complete' and l.site = any($1::text[]) and l.created_at >= $2::date group by 1`, [DAMP, m1]),
    query(`select 'salary:' || person_key as k from paid_out where removed_at is null and how = 'Salary' and paid_on between $1::date and $2::date
        union select 'ads' from expenses where removed_at is null and category = 'Google Ads' and spent_on between $1::date and $2::date`, [m1, lastEnd])
  ]);

  /* Needs you now, worst first; each opens the tab (or page) where it is put right. */
  const attention = [];
  if (now.tax.gap < 0) attention.push({ text: `Tax pot ${pounds(-now.tax.gap)} short of this year's estimate`, tab: 'money', bad: true });
  for (const c of book.cards.filter((x) => x.owed > 0)) {
    attention.push({ text: c.key === 'tax' ? `${pounds(c.owed)} to move to tax savings` : `${c.name} is owed ${pounds(c.owed)}`, tab: 'pay', who: c.key });
  }
  const unpaid = surveys.filter((s) => !s.paid);
  if (unpaid.length) attention.push({ text: `${unpaid.length} survey${unpaid.length === 1 ? '' : 's'} done, ${pounds(unpaid.reduce((t, s) => t + s.price, 0))} to collect`, href: '/staff/surveys.html' });
  const have = new Set(logged.map((r) => r.k));
  for (const k of ['scott', 'tom']) if (!have.has('salary:' + k)) attention.push({ text: `No salary recorded for ${k === 'scott' ? 'Scott' : 'Tom'} in ${monthName(m1)}`, tab: 'pay', who: k });
  if (!have.has('ads')) attention.push({ text: `No Google Ads spend logged for ${monthName(m1)}`, tab: 'money' });
  if (now.vat.rolling >= now.vat.limit * 0.8) attention.push({ text: `VAT threshold ${Math.round(100 * now.vat.rolling / now.vat.limit)}% reached`, tab: 'money', bad: true });

  /* The last six months of money in, by the month each survey was paid in full. */
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const from = monthStart(today, i), to = monthStart(today, i - 1);
    const done = surveys.filter((s) => s.paid && s.paidOn >= from && s.paidOn < to);
    months.push({ month: from.slice(0, 7), in: done.reduce((t, s) => t + s.price, 0), surveys: done.length });
  }

  /* Where the company year is heading: so far, plus the last three full months' pace for what is left of it. */
  const ys = yearStart(today), yearEnd = `${Number(ys.slice(0, 4)) + 1}-11-30`;
  const yearIn = surveys.filter((s) => s.paid && s.paidOn >= ys).reduce((t, s) => t + s.price, 0);
  const pace = months.slice(2, 5).reduce((t, m) => t + m.in, 0) / 3;
  const monthsLeft = Math.max(0, (Date.parse(yearEnd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / (30.44 * 86400000));
  const projIn = Math.round(yearIn + pace * monthsLeft);
  const margin = yearIn > 0 ? now.tax.profit / yearIn : 0;
  const projProfit = Math.round(projIn * margin);

  const enq = (m) => enquiries.find((r) => r.m === m.slice(0, 7)) || { n: 0, booked: 0 };
  return {
    today, attention,
    month: { name: monthName(m0), in: now.period.in, surveys: now.period.surveys, profit: now.period.profit, lastName: monthName(m1), lastIn: last.period.in, lastSurveys: last.period.surveys, lastProfit: last.period.profit,
      enquiries: enq(m0).n, booked: enq(m0).booked, lastEnquiries: enq(m1).n, lastBooked: enq(m1).booked },
    ahead: { surveys: ahead.n, pence: Number(ahead.pence), thisMonth: ahead.this_month, thisMonthPence: Number(ahead.this_month_pence) },
    projection: { monthIn: now.period.in + Number(ahead.this_month_pence), yearFrom: ys, yearTo: yearEnd, yearIn, pace: Math.round(pace), projIn, projProfit, projTax: corpTax(projProfit) },
    months
  };
}
