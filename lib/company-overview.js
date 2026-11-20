/**
 * Company, Overview (the owners' plan, 15 Nov 2026): the running of the
 * business on one screen, urgent first. What needs an owner now (people owed,
 * the tax pot short, money to collect, a salary or the ad spend not logged,
 * last month's bank check not done, the VAT threshold close), then this month against last, what is booked
 * ahead, and where the company year is heading. Everything is worked out from
 * the same figures as Pay and Money (lib/pay-book.js, lib/company-money.js).
 */
import { query, queryOne } from './db.js';
import { payBook, surveysDone, splitSettings } from './pay-book.js';
import { moneyView, corpTax } from './company-money.js';
import { COMPANY_START, companyYear } from './company-start.js';
import { accountantChecks, keyDates } from './accountant.js';
import { growthPlan } from './growth-plan.js';

const DAMP = ['dampscan', 'ati-london'];
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const monthStart = (day, back = 0) => { const d = new Date(day.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
const monthName = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const pounds = (p) => '£' + Math.round(p / 100).toLocaleString('en-GB');

export async function overview({ today = london(new Date()) } = {}) {
  const m0 = monthStart(today), m1 = monthStart(today, 1);
  const lastEnd = new Date(Date.parse(m0 + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const [book, now, last, surveys, ahead, enquiries, checked, logged] = await Promise.all([
    payBook(),
    moneyView({ from: m0, today, withCards: false }),
    moneyView({ from: m1, to: lastEnd, today, withCards: false }),
    splitSettings().then(surveysDone),
    queryOne(`select count(*)::int as n, coalesce(sum(survey_price_pence), 0)::bigint as pence,
        count(*) filter (where job_date < $2::date)::int as this_month, coalesce(sum(survey_price_pence) filter (where job_date < $2::date), 0)::bigint as this_month_pence
        from jobs where site = any($1::text[]) and status = 'booked' and date_set and job_date >= (now() at time zone 'Europe/London')::date`, [DAMP, monthStart(today, -1)]),
    query(`select to_char(l.created_at at time zone 'Europe/London', 'YYYY-MM') as m, count(*)::int as n,
        count(j.id) filter (where j.status not in ('cancelled', 'declined'))::int as booked
        from leads l left join lateral (select id, status from jobs where lead_id = l.id order by id limit 1) j on true
       where l.stage = 'complete' and l.site = any($1::text[]) and l.created_at >= $2::date
         and coalesce(l.closed_reason, '') not like 'Duplicate%' group by 1`, [DAMP, m1]),
    queryOne("select (at at time zone 'Europe/London')::date::text as day from cron_beats where name = 'bank_check_to'").catch(() => null),
    query(`select 'salary:' || person_key as k from paid_out where removed_at is null and how = 'Salary' and paid_on between $1::date and $2::date
        union select 'ads' from expenses where removed_at is null and category = 'Google Ads' and spent_on between $1::date and $2::date`, [m1, lastEnd])
  ]);

  /* Needs you now, worst first; each opens the tab (or page) where it is put right. */
  const attention = [];
  if (now.tax.gap < 0) attention.push({ text: `Tax pot ${pounds(-now.tax.gap)} short of this year's estimate`, tab: 'money', bad: true });
  /* One row each: the amount at the right (figure), people owed grouped into one. */
  const tax = book.cards.find((x) => x.key === 'tax' && x.owed > 0);
  if (tax) attention.push({ text: `${pounds(tax.owed)} to move to tax savings`, label: 'Move to tax savings', figure: pounds(tax.owed), tab: 'pay', who: 'tax' });
  const owed = book.cards.filter((x) => x.key !== 'tax' && x.owed > 0);
  if (owed.length === 1) attention.push({ text: `${owed[0].name} is owed ${pounds(owed[0].owed)}`, label: `${owed[0].name} is owed`, figure: pounds(owed[0].owed), tab: 'pay', who: owed[0].key });
  else if (owed.length) attention.push({ text: `${owed.length} people owed ${pounds(owed.reduce((t, c) => t + c.owed, 0))}`, label: `${owed.length} people owed`, sub: owed.map((c) => `${c.name} ${pounds(c.owed)}`).join(', '), figure: pounds(owed.reduce((t, c) => t + c.owed, 0)), tab: 'pay' });
  /* Today's surveys may not have happened yet: to collect means their day has gone (the morning-after rule). */
  const unpaid = surveys.filter((s) => !s.paid && s.day < today);
  if (unpaid.length) attention.push({ text: `${unpaid.length} survey${unpaid.length === 1 ? '' : 's'} done, ${pounds(unpaid.reduce((t, s) => t + s.price, 0))} to collect`, label: `${unpaid.length} survey${unpaid.length === 1 ? '' : 's'} done, to collect`, figure: pounds(unpaid.reduce((t, s) => t + s.price, 0)), href: '/staff/surveys.html' });
  const have = new Set(logged.map((r) => r.k));
  const noSalary = ['scott', 'tom'].filter((k) => !have.has('salary:' + k)).map((k) => (k === 'scott' ? 'Scott' : 'Tom'));
  /* Nothing to log for a month before the company existed. */
  const companyMonth = lastEnd >= COMPANY_START;
  if (companyMonth && noSalary.length) attention.push({ text: `No salary recorded for ${noSalary.join(' and ')} in ${monthName(m1)}`, label: `No salary logged for ${noSalary.join(' and ')}`, sub: monthName(m1), tab: 'pay', who: noSalary.length === 1 ? noSalary[0].toLowerCase() : undefined });
  if (companyMonth && !have.has('ads')) attention.push({ text: `No Google Ads spend logged for ${monthName(m1)}`, label: 'Google Ads spend not logged', sub: monthName(m1), tab: 'money' });
  /* Tide's statement for last month is out by the first few days of this one. */
  if (companyMonth && Number(today.slice(8, 10)) >= 3 && !(checked && checked.day >= lastEnd)) attention.push({ text: `Bank check for ${monthName(m1)} not done`, label: 'Bank check not done', sub: monthName(m1), tab: 'bank' });
  /* From the Accountant tab: a filing or payment due within 45 days, and what would worry an accountant most. */
  for (const k of keyDates(today).filter((x) => x.days >= 0 && x.days <= 45 && x.what !== 'Company year ends')) {
    attention.push({ text: `${k.what} in ${k.days} day${k.days === 1 ? '' : 's'}`, label: k.what, sub: `in ${k.days} day${k.days === 1 ? '' : 's'}`, tab: 'accountant', bad: k.days <= 14 });
  }
  const acc = await accountantChecks({ today, money: now, book }).catch(() => ({ checks: [] }));
  for (const c of acc.checks.filter((x) => x.ahead || /Dividends|salary/.test(x.text))) attention.push({ text: c.text, tab: c.tab, who: c.who, bad: true });
  /* Hire as the demand arrives: the busiest surveyor over eight a week for four weeks. */
  const plan = await growthPlan({ today }).catch(() => null);
  if (plan && plan.hire.now) attention.push({ text: `Time to hire a surveyor: ${plan.hire.say}`, label: 'Time to hire a surveyor', sub: plan.hire.say, tab: 'growth' });
  if (now.vat.rolling >= now.vat.limit * 0.8) attention.push({ text: `VAT threshold ${Math.round(100 * now.vat.rolling / now.vat.limit)}% reached`, tab: 'money', bad: true });

  /* Money in by month since the company started (up to six), by the month each survey was paid in full.
     The business before the company stays out: it is one line of its own. */
  const company = surveys.filter((s) => s.book === 'new' && s.paid);
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const from = monthStart(today, i), to = monthStart(today, i - 1);
    if (to <= COMPANY_START) continue;
    const done = company.filter((s) => s.paidOn >= from && s.paidOn < to);
    months.push({ month: from.slice(0, 7), in: done.reduce((t, s) => t + s.price, 0), surveys: done.length });
  }

  /* Where the company year is heading: so far, plus the recent pace for what is left of it. */
  const year = companyYear(today), ys = year.from, yearEnd = year.to;
  const yearIn = company.filter((s) => s.paidOn >= ys).reduce((t, s) => t + s.price, 0);
  const pace = now.vat.perMonth;
  const monthsLeft = Math.max(0, (Date.parse(yearEnd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / (30.44 * 86400000));
  const projIn = Math.round(yearIn + pace * monthsLeft);
  const margin = yearIn > 0 ? now.tax.profit / yearIn : 0;
  const projProfit = Math.round(projIn * margin);

  const enq = (m) => enquiries.find((r) => r.m === m.slice(0, 7)) || { n: 0, booked: 0 };
  return {
    today, attention,
    month: { name: monthName(m0), lastBefore: lastEnd < COMPANY_START, in: now.period.in, surveys: now.period.surveys, profit: now.period.profit, lastName: monthName(m1), lastIn: last.period.in, lastSurveys: last.period.surveys, lastProfit: last.period.profit,
      enquiries: enq(m0).n, booked: enq(m0).booked, lastEnquiries: enq(m1).n, lastBooked: enq(m1).booked },
    ahead: { surveys: ahead.n, pence: Number(ahead.pence), thisMonth: ahead.this_month, thisMonthPence: Number(ahead.this_month_pence) },
    projection: { monthIn: now.period.in + Number(ahead.this_month_pence), yearFrom: ys, yearTo: yearEnd, yearIn, pace: Math.round(pace), projIn, projProfit, projTax: corpTax(projProfit) },
    months, start: COMPANY_START, before: now.before
  };
}
