/**
 * The Company pages, read by ChatGPT and Claude (the owner, 20 Nov 2026: a
 * board project that "sees everything"). The same figures as Company in the
 * staff area, never a second reckoning: Overview, Money, Pay and statements,
 * Paying yourselves, Accountant, Growth and Week. Read only, and for the
 * owners alone (the owners' code or whoever manages both damp brands), as the
 * pages are. Company money only, from the company's start (lib/company-start.js).
 */
import { read, fail } from './shared.js';
import { overview } from '../company-overview.js';
import { moneyView } from '../company-money.js';
import { payBook, statement, WHO } from '../pay-book.js';
import { paySelf } from '../pay-self.js';
import { accountantView } from '../accountant.js';
import { growth } from '../company-growth.js';
import { week } from '../company-week.js';
import { companyYear } from '../company-start.js';

const owner = (scope) => scope.isAdmin || ['dampscan', 'ati-london'].every((s) => (scope.levels || {})[s] === 'manage');
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const PENCE = 'Every money figure is in pence: divide by 100 for pounds. ';
const ok = (data, tip) => ({ status: 200, data: { ok: true, ...data, tip: PENCE + tip } });
const guard = (run) => async (scope, args = {}) => (owner(scope) ? run(scope, args) : fail('The Company pages are for the owners.'));

/* The periods Money offers, as London dates. */
function period(which, today = london(new Date())) {
  const m0 = today.slice(0, 8) + '01';
  if (which === 'last') { const e = new Date(m0 + 'T12:00:00Z'); e.setUTCDate(0); const end = e.toISOString().slice(0, 10); return { from: end.slice(0, 8) + '01', to: end }; }
  if (which === 'year') return { from: companyYear(today).from, to: null };
  return { from: m0, to: null };
}

export const COMPANY_TOOLS = [
  read('company_overview', 'Company overview', 'Company, Overview: what needs an owner now (tax pot, people owed, surveys to collect, salaries or ad spend not logged, the bank check, filing dates, dividends or a director paid ahead), this month against last, booked ahead, where the company year is heading, and money in by month. Owners only.',
    {}, guard(async () => ok(await overview(), 'Lead with Needs you now, then the month, then the year heading for.'))),
  read('company_money', 'Company money', 'Company, Money for a period: money in, every cost, profit; where the money went (card fees, tax pot, surveyor fees, shared, to the penny); who gets what (each person\'s fees, share, owed now and coming); card payments (taken, Stripe fees and rate, refunds, paid into Tide and still in Stripe); corporation tax for the company year (profit, due, set aside, in tax savings, paid to HMRC, still to move); the VAT threshold; ways to lower tax; and the expenses logged. period: month (default), last (last month) or year (the company year). Owners only.',
    { period: { type: 'string', enum: ['month', 'last', 'year'] } }, guard(async (scope, { period: p }) => {
      const r = period(p || 'month');
      const v = await moneyView({ from: r.from, to: r.to });
      return ok({ ...v, expenses: v.expenses.map((e) => ({ day: e.day, pence: e.pence, category: e.category, what: e.what, receipt: Boolean(e.receipt) })) },
        'Say money in, costs and profit first, then where it went and who gets what, then tax and VAT. Tax points are prompts for the accountant.');
    })),
  read('pay_book', 'Pay', 'Company, Pay: what each of Corp tax, Scott, Tom, Ben and Ronnie is owed now (earned less paid out), earned, paid and coming, and the surveys in the period with each one\'s split. who gives that person\'s statement with its running balance instead. Owners only.',
    { who: { type: 'string', enum: WHO } }, guard(async (scope, { who }) => {
      if (who) { const s = await statement(who); return s.error ? fail(s.error) : ok({ ...s, old: undefined }, 'Read the balance owed, then the lines newest first.'); }
      const b = await payBook();
      return ok({ cards: b.cards, totals: b.totals, check: b.check, settings: b.settings, surveys: b.rows.slice(0, 60) }, 'Say who is owed what now, Corp tax first.');
    })),
  read('paying_yourselves', 'Paying yourselves', 'Pay, Paying yourselves: Scott\'s and Tom\'s tax year (salary, dividends, the 10.75% band left, the dividend to take now and why), mileage from the surveys driven by month (claimed and to claim), the seven tax-efficient steps with which are done, and the dates to act on. Assumes no other income. Owners only.',
    {}, guard(async () => ok(await paySelf(), 'Lead with what each can take now, then mileage to claim, then the steps not done and the next date. Never advice: point tax questions to the accountant.'))),
  read('accountant_view', 'Accountant', 'Company, Accountant: what to put right before the accountant sees the books, every filing and payment date with the days left (the first long year is two corporation tax periods), the company year\'s figures, and the questions only the accountant can answer. Owners only.',
    {}, guard(async () => ok(await accountantView(), 'Lead with anything to put right, then dates inside 60 days, then the questions.'))),
  read('growth_view', 'Growth', 'Company, Growth: Google Ads (spend against enquiries, bookings and money, cost per booking, return per pound), month by month visitors, enquiries, booked and paid, every source over the trading year, the booking form step by step, and problems on the website. Owners only.',
    {}, guard(async () => ok(await growth(), 'Lead with Google Ads return, then the best and worst sources, then where the booking form loses people.'))),
  read('company_week', 'Monday briefing', 'Company, Week: last week against the week before, what needs an owner now, the week ahead day by day, customers to book and Ads this month. Owners only.',
    {}, guard(async () => ok(await week(), 'Say last week in one line, then what needs doing, then the week ahead.')))
];
