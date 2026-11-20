/**
 * Company, Accountant (the owner, 20 Nov 2026: "world class features that help
 * us out, and when we need an accountant"). What the company owes and when,
 * what to put right before the accountant sees the books, the questions only
 * the accountant can answer, and the year's records to download
 * (lib/accountant-csv.js). Worked out from the same figures as Money and Pay;
 * prompts for the accountant, never advice.
 *
 * Dates follow the rules for a company incorporated on 10 Nov 2026 with a 30
 * November year end: a first period of accounts over twelve months is two
 * corporation tax periods (the first twelve months, then the rest); tax is due
 * nine months and a day after each period ends and the return twelve months
 * after; the first accounts 21 months after incorporation, later ones nine
 * months after the year end; the confirmation statement within 14 days of
 * each anniversary's statement date.
 */
import { query, queryOne } from './db.js';
import { COMPANY_START, companyYear } from './company-start.js';
import { moneyView } from './company-money.js';
import { payBook } from './pay-book.js';

const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const DAY = 86400000;
const PERSONAL_ALLOWANCE = 1257000;
const at = (d) => Date.parse(d + 'T12:00:00Z');
const addDays = (d, n) => new Date(at(d) + n * DAY).toISOString().slice(0, 10);
/* Months on, as HMRC and Companies House count them: a month's last day lands on the last day of the month (30 Nov plus 9 is 31 Aug). */
export function addMonths(d, n) {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1, day = Number(d.slice(8, 10));
  const last = (yy, mm) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m + n, 1));
  const ty = t.getUTCFullYear(), tm = t.getUTCMonth();
  const dd = day === last(y, m) ? last(ty, tm) : Math.min(day, last(ty, tm));
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
const pounds = (p) => '£' + (Math.round(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** The corporation tax periods inside a company year: never longer than twelve months. Pure. */
export function taxPeriods(year) {
  const twelve = addDays(addMonths(year.from, 12), -1);
  return twelve < year.to ? [{ from: year.from, to: twelve }, { from: addDays(twelve, 1), to: year.to }] : [{ from: year.from, to: year.to }];
}

/** Every filing and payment date for the company year a day falls in, soonest first, with days left. Pure. */
export function keyDates(today) {
  const year = companyYear(today);
  const out = [{ what: 'Company year ends', day: year.to }];
  const periods = taxPeriods(year);
  periods.forEach((p, i) => {
    const which = periods.length > 1 ? ` (${i ? 'second' : 'first'} period)` : '';
    out.push({ what: `Corporation tax to pay${which}`, day: addDays(addMonths(p.to, 9), 1) });
    out.push({ what: `Corporation tax return${which}`, day: addMonths(p.to, 12) });
  });
  const first = year.from === COMPANY_START;
  out.push({ what: 'Accounts to Companies House', day: first ? addMonths(COMPANY_START, 21) : addMonths(year.to, 9) });
  /* The statement date is the day before each anniversary of incorporation; filed within 14 days. */
  let statement = `${today.slice(0, 4)}${addDays(COMPANY_START, -1).slice(4)}`;
  if (addDays(statement, 14) < today || statement <= COMPANY_START) statement = `${Number(statement.slice(0, 4)) + 1}${statement.slice(4)}`;
  out.push({ what: 'Confirmation statement', day: addDays(statement, 14) });
  return out.map((d) => ({ ...d, days: Math.round((at(d.day) - at(today)) / DAY) })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

/* The tax year a day is in (6 April to 5 April), for salaries against the personal allowance. */
const taxYearFrom = (today) => { const y = Number(today.slice(0, 4)); return today >= `${y}-04-06` ? `${y}-04-06` : `${y - 1}-04-06`; };

/** What to put right before the accountant sees the books, worst first. Each { text, bad, tab }. */
export async function accountantChecks({ today = london(new Date()), money = null, book = null } = {}) {
  const year = companyYear(today);
  const [m, b, out, receipts, checked] = await Promise.all([
    money || moneyView({ from: year.from, today, withCards: false }),
    book || payBook(),
    query("select person_key, amount_pence, paid_on::text as day, how from paid_out where removed_at is null and paid_on >= $1::date", [COMPANY_START]),
    queryOne("select count(*)::int as n, coalesce(sum(amount_pence), 0)::bigint as pence from expenses where removed_at is null and receipt_path is null and spent_on >= $1::date", [year.from]),
    queryOne("select (at at time zone 'Europe/London')::date::text as day from cron_beats where name = 'bank_check_to'").catch(() => null)
  ]);
  const checks = [];
  /* Dividends come only from profit after tax: more than that is unlawful and has to be paid back. */
  const dividends = out.filter((p) => p.how === 'Dividend' && p.day >= year.from).reduce((t, p) => t + Number(p.amount_pence), 0);
  const afterTax = m.tax.profit - m.tax.estimate;
  if (dividends > afterTax) checks.push({ text: `Dividends ${pounds(dividends)} are more than the profit after tax ${pounds(Math.max(0, afterTax))}`, bad: true, tab: 'pay' });
  /* A director paid ahead of their share: a director's loan unless it is a lawful dividend, the accountant's call. */
  for (const c of b.cards.filter((x) => ['scott', 'tom'].includes(x.key) && x.owed < 0)) {
    checks.push({ text: `${c.name} has been paid ${pounds(-c.owed)} ahead of his share`, bad: true, tab: 'pay', who: c.key, ahead: true });
  }
  if (Number(receipts.n)) checks.push({ text: `${receipts.n} cost${receipts.n === 1 ? '' : 's'} with no receipt (${pounds(Number(receipts.pence))})`, tab: 'money' });
  const lastEnd = addDays(`${today.slice(0, 8)}01`, -1);
  if (lastEnd >= COMPANY_START && !(checked && checked.day >= lastEnd)) checks.push({ text: 'Bank check not done to the end of last month', tab: 'bank' });
  const pc = Math.round(100 * m.vat.rolling / m.vat.limit);
  if (pc >= 75) checks.push({ text: `VAT threshold ${pc}% reached`, bad: true, tab: 'money' });
  const ty = taxYearFrom(today);
  for (const k of ['scott', 'tom']) {
    const pay = out.filter((p) => p.person_key === k && p.how === 'Salary' && p.day >= ty).reduce((t, p) => t + Number(p.amount_pence), 0);
    if (pay > PERSONAL_ALLOWANCE) checks.push({ text: `${k === 'scott' ? 'Scott' : 'Tom'}'s salary ${pounds(pay)} is over the £12,570 allowance this tax year`, bad: true, tab: 'pay' });
  }
  return { checks: checks.sort((a, c) => Number(Boolean(c.bad)) - Number(Boolean(a.bad))), dividends, afterTax, money: m };
}

/** The tab: dates, checks, the year's figures and the questions to take to the accountant. */
export async function accountantView({ today = london(new Date()) } = {}) {
  const year = companyYear(today);
  const money = await moneyView({ from: year.from, today, withCards: false });
  const { checks, dividends, afterTax } = await accountantChecks({ today, money });
  const salaries = money.period.costs.find((c) => c.name === 'Salaries');
  const questions = [];
  if (taxPeriods(year).length > 1) questions.push('The first year is two corporation tax periods: how is profit split between them?');
  if (money.vat.before) questions.push('Does turnover from before the company count towards the VAT threshold?');
  if (salaries) questions.push('Is the payroll (PAYE) running for the directors\' salaries?');
  if (dividends) questions.push('Are dividend vouchers and board minutes kept for each dividend?');
  if (checks.some((c) => c.ahead)) questions.push('A director paid ahead of his share: a director\'s loan or a dividend?');
  questions.push('Mileage, use of home and pension contributions: what can the company pay this year?');
  return {
    today, year, dates: keyDates(today), checks, questions,
    figures: { in: money.period.in, cost: money.period.cost, profit: money.period.profit, tax: money.tax.estimate, dividends, afterTax, vat: money.vat.rolling, vatLimit: money.vat.limit, surveys: money.period.surveys }
  };
}
