/**
 * Paying yourselves (the owner, 20 Nov 2026: "the most efficient way to be
 * paid now"), on Pay for the owners: Scott's and Tom's salary and dividends
 * against this tax year's bands, the dividend still to take at the basic rate,
 * what the company can pay, the mileage to claim (lib/mileage.js), seven steps
 * each ticked from the books, and the dates that matter. Prompts for the
 * accountant, never advice: it assumes neither director has other income.
 *
 * The rates for the tax year from 6 April 2026, kept here so a Budget is one edit.
 */
import { query } from './db.js';
import { COMPANY_START, companyYear } from './company-start.js';
import { accountantChecks } from './accountant.js';
import { mileage, taxYear, DIRECTORS } from './mileage.js';
import { payBook } from './pay-book.js';

export const RATES = { allowance: 1257000, basicTop: 5027000, dividendAllowance: 50000, basicDividend: 0.1075, higherDividend: 0.3575, salaryMonth: 104750, homeMonth: 2600, smallProfits: 5000000 };
const NAME = { scott: 'Scott', tom: 'Tom' };
const DAY = 86400000;
const at = (d) => Date.parse(d + 'T12:00:00Z');
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const pounds = (p) => (p < 0 ? '−£' : '£') + Math.round(Math.abs(p) / 100).toLocaleString('en-GB');

/** One director's tax year: salary, dividends, and the dividend left before the higher rate. Pure. */
export function bands(salary, dividends) {
  /* The salary is planned at the allowance for the year, so the band left counts the whole of it. */
  const pay = Math.max(salary, RATES.allowance);
  const room = Math.max(0, RATES.basicTop - pay - dividends);
  const basic = Math.max(0, Math.min(dividends, RATES.basicTop - pay) - RATES.dividendAllowance);
  const higher = Math.max(0, dividends - Math.max(0, RATES.basicTop - pay));
  return { salary, dividends, room, tax: Math.round(basic * RATES.basicDividend + higher * RATES.higherDividend), over: higher };
}

export async function paySelf({ today = london(new Date()) } = {}) {
  const ty = taxYear(today), year = companyYear(today);
  const [out, homeClaims, miles, book] = await Promise.all([
    query(`select person_key, amount_pence, paid_on::text as day, how from paid_out where removed_at is null and person_key = any($1::text[])
       and how in ('Salary', 'Dividend') and paid_on >= greatest($2::date, $3::date)`, [DIRECTORS, ty.from, COMPANY_START]),
    query("select spent_on::text as day from expenses where removed_at is null and category = 'Use of home' and spent_on >= $1::date", [ty.from]),
    mileage(today),
    payBook()
  ]);
  const acc = await accountantChecks({ today, book });
  const headroom = Math.max(0, acc.afterTax - acc.dividends);
  const month = today.slice(0, 7);

  const people = DIRECTORS.map((k) => {
    const mine = out.filter((p) => p.person_key === k);
    const sum = (how) => mine.filter((p) => p.how === how).reduce((t, p) => t + Number(p.amount_pence), 0);
    const b = bands(sum('Salary'), sum('Dividend'));
    const card = book.cards.find((c) => c.key === k) || { owed: 0 };
    const m = miles.find((x) => x.who === k);
    return { key: k, name: NAME[k], ...b, salaryThisMonth: mine.some((p) => p.how === 'Salary' && p.day.slice(0, 7) === month),
      owed: card.owed, takeNow: Math.max(0, Math.min(b.room, card.owed, headroom)), mileage: m };
  });

  /* The company year's profit heading for, against the £50,000 the small profits rate stops at. */
  const m = acc.money, daysIn = Math.max(1, (at(today) - at(year.from)) / DAY + 1), daysAll = (at(year.to) - at(year.from)) / DAY + 1;
  const profitHeading = Math.round(m.tax.profit / daysIn * daysAll);

  const steps = [
    { n: 1, title: 'Salary £1,047.50 a month each', done: people.every((p) => p.salaryThisMonth), say: people.filter((p) => !p.salaryThisMonth).map((p) => p.name).join(' and ') + (people.some((p) => !p.salaryThisMonth) ? ': not logged this month' : 'Logged this month') },
    { n: 2, title: 'Dividends inside the 10.75% band', done: people.every((p) => !p.over), say: people.map((p) => `${p.name} ${pounds(p.room)} left`).join(', ') },
    { n: 3, title: 'Mileage claimed', done: people.every((p) => !p.mileage.toClaim.length), say: people.map((p) => `${p.name} ${p.mileage.toClaim.length ? pounds(p.mileage.toClaim.reduce((t, x) => t + x.pence, 0)) + ' to claim' : 'up to date'}`).join(', ') },
    { n: 4, title: 'Use of home £6 a week', done: homeClaims.some((h) => h.day.slice(0, 7) === month), say: homeClaims.length ? `${homeClaims.length} month${homeClaims.length === 1 ? '' : 's'} claimed this tax year` : 'Not claimed yet' },
    { n: 5, title: 'Kit, phone and training through the company', done: null, say: 'Bought by the company, never personally' },
    { n: 6, title: 'Profit under £50,000 (19% tax)', done: profitHeading <= RATES.smallProfits, say: `Heading for ${pounds(Math.max(0, profitHeading))} by ${new Date(at(year.to)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` },
    { n: 7, title: 'Ask the accountant', done: null, say: 'Alphabet shares, a partner\'s shares, an electric car' }
  ];

  return { today, taxYear: ty, rates: RATES, people, headroom, steps, milestones: milestones(today, ty, year, people, profitHeading, m.tax.profit, daysIn) };
}

/** The dates to act on, soonest first, each saying what to do. Pure. */
export function milestones(today, ty, year, people, profitHeading, profitSoFar, daysIn) {
  const next = (mmdd) => { const y = Number(today.slice(0, 4)); const d = `${y}-${mmdd}`; return d >= today ? d : `${y + 1}-${mmdd}`; };
  const left = people.reduce((t, p) => t + p.room, 0);
  const endOfMonth = (() => { const d = new Date(at(today.slice(0, 8) + '01')); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
  const list = [
    { day: endOfMonth, what: 'Salary and mileage', say: 'Pay £1,047.50 each and the month\'s mileage' },
    { day: ty.to, what: 'Last day of the tax year', say: left ? `${pounds(left)} of dividends still at 10.75% between you; ISA allowance too` : 'Bands used' },
    { day: next('04-06'), what: 'New tax year', say: 'Bands, the £500 dividend allowance and the 10,000 miles start again; claim the Employment Allowance' },
    { day: next('01-31'), what: 'Self Assessment', say: 'Dividend tax for the last tax year is due' },
    { day: next('07-31'), what: 'Payment on account', say: 'Half of next year\'s tax, if last year\'s bill was over £1,000' },
    { day: year.to, what: 'Company year ends', say: 'Buy kit before this to take it off this year\'s profit' }
  ];
  /* When profit would pass £50,000 at this pace: worth spending on the business before then. */
  if (profitSoFar > 0 && profitHeading > RATES.smallProfits) {
    const d = new Date(at(year.from) + (RATES.smallProfits / (profitSoFar / daysIn)) * DAY).toISOString().slice(0, 10);
    if (d >= today) list.push({ day: d, what: 'Profit passes £50,000', say: 'Each pound after is taxed at 26.5%' });
  }
  for (const p of people) {
    const ms = p.mileage.months, total = ms.reduce((t, x) => t + x.miles, 0);
    if (total > 0 && total < 10000) {
      const perDay = total / Math.max(1, (at(today) - at(ty.from)) / DAY);
      const d = new Date(at(today) + ((10000 - total) / perDay) * DAY).toISOString().slice(0, 10);
      if (d <= ty.to) list.push({ day: d, what: `${p.name} reaches 10,000 miles`, say: 'Mileage drops to 25p a mile' });
    }
  }
  return list.filter((x) => x.day >= today).sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((x) => ({ ...x, days: Math.round((at(x.day) - at(today)) / DAY) }));
}
