/**
 * Company, Money (the owners' plan, 15 Nov 2026): money in, every cost, the
 * profit, corporation tax worked out on that profit (not on the price), the
 * tax pot, the VAT threshold and the ways to lower this year's tax. Worked out
 * live from the surveys (lib/pay-book.js), the payments out (paid_out) and the
 * expenses log (expenses).
 *
 * Costs: Ronnie's and Ben's shares (they invoice), card fees, texts (an
 * estimate per text sent, SMS_PENCE, default 5p), salaries recorded on Pay,
 * and every expense logged here, Google Ads among them. Scott's and Tom's
 * shares beyond salary are dividends from profit after tax, so not a cost.
 *
 * The rates are the ones in force for the year to 30 Nov 2027 as the owners
 * were told them (19% to £50k, 25% over £250k, marginal relief between); kept
 * here so a Budget is one edit. Prompts for the accountant, never advice.
 */
import { query, queryOne } from './db.js';
import { surveysDone, splitSettings, runningCosts, CUTOVER } from './pay-book.js';
import { COMPANY_START, companyYear, fromStart } from './company-start.js';
import { cardFees, whoGetsWhat, newBookOut } from './company-money-parts.js';

export const CATEGORIES = ['Google Ads', 'Bank fees', 'Software', 'Equipment', 'Insurance', 'Vehicle and fuel', 'Mileage', 'Use of home', 'Phone', 'Accountant', 'Other'];
const VAT_LIMIT = 9000000;
export const BANK_REF = /^[a-f0-9]{32}$/;
const SMALL = 5000000, MAIN = 25000000;
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** Corporation tax on a year's profit, in pence: 19% up to £50k, 25% over £250k, marginal relief between. */
export function corpTax(profit) {
  if (profit <= 0) return 0;
  if (profit <= SMALL) return Math.round(profit * 0.19);
  if (profit >= MAIN) return Math.round(profit * 0.25);
  return Math.round(profit * 0.25 - (MAIN - profit) * 3 / 200);
}
/** The rate the next pound of profit is taxed at, for "this saves you". */
export const marginalRate = (profit) => (profit <= SMALL ? 0.19 : profit >= MAIN ? 0.25 : 0.265);

/* The company year (its first from incorporation, lib/company-start.js). */
export const yearStart = (today = london(new Date())) => companyYear(today).from;

async function expenses() {
  return (await query(`select id, spent_on::text as day, amount_pence, category, what, receipt_path, added_by from expenses
     where removed_at is null order by spent_on desc, id desc`).catch(() => [])).map((e) => ({ id: Number(e.id), day: e.day, pence: Number(e.amount_pence), category: e.category, what: e.what, receipt: e.receipt_path || null, by: e.added_by }));
}

export async function addExpense({ day, pence, category, what, receipt, bankRef }, by) {
  const p = Math.round(Number(pence));
  if (!Number.isFinite(p) || p <= 0 || p > 100000000) return { error: 'Enter the amount.' };
  if (!CATEGORIES.includes(category)) return { error: 'Pick what it was for.' };
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : london(new Date());
  const path = /^leads\/\d{4}-\d{2}-\d{2}\/[\w.-]{1,200}$/.test(String(receipt || '')) ? receipt : null;
  const r = await queryOne('insert into expenses (spent_on, amount_pence, category, what, receipt_path, added_by, bank_ref) values ($1, $2, $3, $4, $5, $6, $7) returning id',
    [on, p, category, String(what || '').slice(0, 200) || null, path, by || null, BANK_REF.test(String(bankRef || '')) ? bankRef : null]);
  return { ok: true, id: Number(r.id) };
}
export async function removeExpense(id, by) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) return { error: 'Which one?' };
  const r = await queryOne('update expenses set removed_at = now(), removed_by = $2 where id = $1 and removed_at is null returning id', [Number(id), by || null]);
  return r ? { ok: true } : { error: 'Already removed.' };
}

/** The Money tab for a period (from, to inclusive), plus the year's tax and the rolling VAT figure. Company money only. */
export async function moneyView({ from, to = null, today = london(new Date()), fetchImpl = fetch, withCards = true } = {}) {
  const settings = await splitSettings();
  const [all, out, costs, bookOut] = await Promise.all([surveysDone(settings), query("select person_key, amount_pence, paid_on::text as day, how from paid_out where removed_at is null"), expenses(), newBookOut()]);
  const smsPence = Number(process.env.SMS_PENCE) || 5;
  const year = companyYear(today);
  /* Nothing before the company started counts: the Revolut book is the business before it. */
  from = fromStart(from);
  const inP = (d) => d && d >= from && (!to || d <= to);
  const surveys = all.filter((s) => s.book === 'new');
  const paid = surveys.filter((s) => s.paid);
  /* Salaries the company paid: the new book's, never a Revolut one dated after the start. */
  const salaries = bookOut.filter((p) => p.how === 'Salary').map((p) => ({ day: p.day, amount_pence: p.pence }));

  async function figures(a, b) {
    const within = (d) => d && (!a || d >= a) && (!b || d <= b);
    const done = paid.filter((s) => within(s.paidOn));
    const sum = (f) => done.reduce((t, s) => t + f(s), 0);
    const texts = Number((await queryOne(`select count(*)::int as n from sms_outbox where status in ('sent', 'delivered') and site in ('dampscan', 'ati-london')
        and ($1::date is null or (sent_at at time zone 'Europe/London')::date >= $1::date) and ($2::date is null or (sent_at at time zone 'Europe/London')::date <= $2::date)`, [a, b]).catch(() => ({ n: 0 }))).n);
    const lines = [
      ['Ronnie', sum((s) => s.share.ronnie)], ['Ben', sum((s) => s.share.ben)], ['Card fees', sum((s) => s.fees)],
      ['Texts (estimate)', texts * smsPence],
      ['Salaries', salaries.filter((p) => within(p.day)).reduce((t, p) => t + Number(p.amount_pence), 0)],
      ...CATEGORIES.map((c) => [c, costs.filter((e) => within(e.day) && e.category === c).reduce((t, e) => t + e.pence, 0)])
    ].filter((l) => l[1]);
    const money = sum((s) => s.price);
    const cost = lines.reduce((t, l) => t + l[1], 0);
    return { in: money, surveys: done.length, costs: lines.map((l) => ({ name: l[0], pence: l[1] })), cost, profit: money - cost, done };
  }

  const period = await figures(from, to);
  /* The company year so far: the tax worked out on its real profit, against what has been set aside and moved. */
  const yearSoFar = await figures(year.from, null);
  const estimate = corpTax(yearSoFar.profit);
  const setAside = paid.filter((s) => s.paidOn >= year.from).reduce((t, s) => t + s.share.tax, 0);
  const taxOut = bookOut.filter((p) => p.who === 'tax' && p.day >= year.from);
  const inPot = taxOut.filter((p) => p.how !== 'Paid to HMRC').reduce((t, p) => t + p.pence, 0);
  const paidHmrc = taxOut.filter((p) => p.how === 'Paid to HMRC').reduce((t, p) => t + p.pence, 0);
  const tax = { yearFrom: year.from, yearTo: year.to, profit: yearSoFar.profit, estimate, setAside, inPot, paidHmrc, toMove: setAside - inPot - paidHmrc, gap: setAside - estimate, rate: marginalRate(yearSoFar.profit) };

  /* VAT: the company's own turnover in the last 12 months against £90,000, and when it would cross at the recent pace.
     The business before the company is shown beside it: whether it counts is the accountant's call. */
  const d12 = new Date(Date.parse(today + 'T12:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const d3 = new Date(Date.parse(today + 'T12:00:00Z') - 91 * 86400000).toISOString().slice(0, 10);
  const rolling = paid.filter((s) => s.paidOn > d12).reduce((t, s) => t + s.price, 0);
  const oldPaid = all.filter((s) => s.book === 'old' && s.paid);
  const before12 = oldPaid.filter((s) => s.paidOn > d12).reduce((t, s) => t + s.price, 0);
  /* A young company has no three months behind it: the pace is what it has done per day so far. */
  const since = d3 > COMPANY_START ? d3 : COMPANY_START;
  const daysRun = Math.max(1, (Date.parse(today + 'T12:00:00Z') - Date.parse(since + 'T12:00:00Z')) / 86400000 + 1);
  const pace = paid.filter((s) => s.paidOn >= since).reduce((t, s) => t + s.price, 0) / daysRun * 30.44;
  const monthsLeft = pace > 0 ? Math.max(0, (VAT_LIMIT - rolling) / pace) : null;
  const vat = { limit: VAT_LIMIT, over: rolling >= VAT_LIMIT, rolling, before: before12, perMonth: Math.round(pace), crossOn: monthsLeft == null ? null : new Date(Date.parse(today + 'T12:00:00Z') + monthsLeft * 30.4 * 86400000).toISOString().slice(0, 10) };

  /* The business before the company, in one line, so it is never mixed in and never lost. */
  const before = { in: oldPaid.reduce((t, s) => t + s.price, 0), surveys: oldPaid.length, to: CUTOVER };
  const split = whoGetsWhat(period.done, surveys, bookOut, (await runningCosts(settings)).total);
  const cards = withCards ? await cardFees(from, to, { fetchImpl }) : null;
  delete period.done; delete yearSoFar.done;

  /* Prompts, each with what it would save at this year's rate. For the accountant to confirm. */
  const r = tax.rate, save = (pence) => Math.round(pence * r);
  const ideas = [
    { title: 'Company pension contributions', says: 'Paid by the company into your pensions: a cost before tax, no National Insurance, up to £60,000 a year each.', example: 300000, saves: save(300000) },
    { title: 'Equipment before 30 November', says: 'A drone, meters, a thermal camera or laptops bought before the year end come off this year\'s profit in full.', example: 150000, saves: save(150000) },
    { title: 'Mileage at 45p a mile', says: 'Surveyors using their own cars can be paid 45p a mile (25p after 10,000), tax free. The routes already know every drive.', example: 45000, saves: save(45000) },
    { title: 'An electric van or car', says: 'Bought through the company, it comes off profit in full in the first year, with very little benefit in kind tax.', example: 3000000, saves: save(3000000) },
    { title: 'Working from home', says: 'A small allowance for each director running the business from home.', example: 31200, saves: save(31200) }
  ];
  return { from, to, start: COMPANY_START, period, tax, vat, before, who: split.people, flow: split.flow, cards, settings: { taxBp: settings.taxBp, shares: settings.shares },
    ideas, expenses: costs.filter((e) => inP(e.day)), categories: CATEGORIES, smsPence };
}
