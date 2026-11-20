/**
 * The company's records for the accountant, one file for a period (the owner,
 * 20 Nov 2026): every survey paid with its card fee and where the money came
 * in, refunds, every cost (with whether a receipt is kept), every payment out
 * (salaries, dividends, Ronnie's and Ben's invoices, the tax pot, HMRC) and a
 * summary. Company money only (lib/company-start.js), opened in Excel or
 * Numbers. Downloaded by the owners from Company, Accountant.
 */
import { query } from './db.js';
import { moneyView } from './company-money.js';
import { surveysDone, splitSettings, NAMES } from './pay-book.js';
import { fromStart } from './company-start.js';
import { newBookOut } from './company-money-parts.js';

const cell = (v) => {
  const s = v == null ? '' : String(v);
  /* A leading =, +, - or @ would run as a formula in a spreadsheet. */
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const gbp = (p) => (Number(p) / 100).toFixed(2);

export async function accountsCsv({ from, to } = {}) {
  from = fromStart(from);
  const within = (d) => d && d >= from && (!to || d <= to);
  const settings = await splitSettings();
  const [surveys, refunds, costs, out, money] = await Promise.all([
    surveysDone(settings),
    query(`select (p.created_at at time zone 'Europe/London')::date::text as day, -p.amount_pence as pence, j.id, j.customer_name, j.customer_postcode
       from job_payments p join jobs j on j.id = p.job_id where p.label = 'refund' and j.site in ('dampscan', 'ati-london') order by 1`),
    query("select spent_on::text as day, amount_pence, category, what, receipt_path from expenses where removed_at is null order by spent_on, id"),
    newBookOut(),
    moneyView({ from, to, withCards: false })
  ]);
  const rows = [['Section', 'Date', 'Who or what', 'Reference', 'Amount (£)', 'Card fee (£)', 'Note']];
  for (const s of surveys.filter((x) => x.book === 'new' && x.paid && within(x.paidOn)).sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1))) {
    rows.push(['Income', s.paidOn, `${s.name}${s.postcode ? ', ' + s.postcode : ''}`, `Survey ${s.id}`, gbp(s.price), gbp(s.fees), `Paid via ${s.via}`]);
  }
  for (const r of refunds.filter((x) => within(x.day))) rows.push(['Refund', r.day, `${r.customer_name || 'Customer'}${r.customer_postcode ? ', ' + r.customer_postcode : ''}`, `Survey ${r.id}`, gbp(-r.pence), '', 'Refunded to the customer']);
  for (const e of costs.filter((x) => within(x.day))) rows.push(['Cost', e.day, e.category, '', gbp(-e.amount_pence), '', [e.what, e.receipt_path ? 'receipt kept' : 'no receipt'].filter(Boolean).join('; ')]);
  for (const p of out.filter((x) => within(x.day)).sort((a, b) => (a.day < b.day ? -1 : 1))) {
    rows.push(['Paid out', p.day, NAMES[p.who] || p.who, p.how || '', gbp(-p.pence), '', p.who === 'tax' ? 'Tax pot' : '']);
  }
  const t = money.period;
  rows.push([], ['Summary', from, to || 'today', '', '', '', '']);
  rows.push(['Summary', '', 'Money in (surveys paid in full)', '', gbp(t.in), '', `${t.surveys} surveys`]);
  for (const c of t.costs) rows.push(['Summary', '', c.name, '', gbp(-c.pence), '', c.name === 'Texts (estimate)' ? 'Estimated' : '']);
  rows.push(['Summary', '', 'Profit', '', gbp(t.profit), '', '']);
  rows.push(['Summary', '', 'Corporation tax estimate, company year', '', gbp(money.tax.estimate), '', 'For the accountant to confirm']);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
