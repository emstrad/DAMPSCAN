/**
 * The monthly bank check (the owners' plan, 15 Nov 2026): the company account
 * is Tide, which has no feed, so once a month its statement (CSV) is uploaded
 * on Company and every line is checked against the logbook. Nothing is stored
 * from the file itself and nothing on a customer's survey changes here: money
 * in is put beside the survey it pays for (ticked on their card by hand, as
 * now), money out beside a payment on Pay or an expense, and what is left over
 * is listed to be put right in one tap (lib/company-money.js, lib/pay-book.js,
 * each remembering the line it came from in bank_ref).
 */
import { createHash } from 'node:crypto';
import { query } from './db.js';

/* How far the statements checked reach (cron_beats 'bank_check_to'), so Overview can say when last month's check is still to do. */
const CHECKED = `insert into cron_beats (name, at) values ('bank_check_to', $1::date) on conflict (name) do update set at = greatest(cron_beats.at, excluded.at)`;
import { parseCsv, toPence, splitDate } from './bank/csv.js';
import { scoreJob } from './bank/match.js';
import { candidateJobs } from './bank/ledger.js';
import { NAMES } from './pay-book.js';

/* Every name Tide (and a bank like it) has used for a column, most specific first. */
const COLS = {
  id: ['transaction id', 'id'],
  day: ['date', 'transaction date', 'posted date', 'completed date', 'timestamp'],
  what: ['transaction description', 'description', 'details', 'name', 'merchant', 'payee', 'counterparty'],
  reference: ['reference', 'payment reference'],
  type: ['transaction type', 'payment type', 'type'],
  amount: ['amount', 'amount (gbp)', 'value'],
  in: ['paid in', 'money in', 'credit', 'amount in'],
  out: ['paid out', 'money out', 'debit', 'amount out']
};
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAY = 86400000;

/** "2026-11-03", "03/11/2026", "03-11-2026" or "3 Nov 2026" to 2026-11-03. */
export function tideDay(value) {
  const s = String(value || '').trim();
  const [iso] = splitDate(s.replace(/^(\d{2})-(\d{2})-(\d{4})/, '$1/$2/$3'));
  if (iso) return iso;
  const m = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})/.exec(s);
  return m && MONTHS[m[2].toLowerCase()] ? `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** The statement's lines, money in positive, out negative, each with a fingerprint. */
export function tideLines(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { error: 'That file is empty.' };
  const head = table[0].map((h) => String(h || '').trim().toLowerCase());
  const at = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, names.map((n) => head.indexOf(n)).find((i) => i !== -1) ?? -1]));
  if (at.day === -1 || at.what === -1 || (at.amount === -1 && at.in === -1 && at.out === -1)) return { error: 'That does not look like a bank statement. Export it from Tide as CSV.' };
  const cell = (row, k) => (at[k] === -1 ? '' : String(row[at[k]] ?? '').trim());
  const lines = [], seen = new Map();
  let unreadable = 0;
  for (const row of table.slice(1)) {
    const day = tideDay(cell(row, 'day'));
    let pence = at.amount !== -1 ? toPence(cell(row, 'amount')) : null;
    if (pence === null) pence = (toPence(cell(row, 'in')) || 0) - Math.abs(toPence(cell(row, 'out')) || 0);
    if (!day || !pence) { unreadable += 1; continue; }
    const what = cell(row, 'what'), reference = cell(row, 'reference');
    const base = cell(row, 'id') ? `id|${cell(row, 'id')}` : `${day}|${pence}|${what}|${reference}`;
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    lines.push({ ref: createHash('sha256').update(`${base}|${n}`).digest('hex').slice(0, 32), day, pence, what, reference, type: cell(row, 'type') });
  }
  return lines.length ? { lines, unreadable } : { error: 'No lines could be read in that file.' };
}

/* What an unmatched payment out probably is, from its words: a person on Pay, HMRC, or a kind of cost. */
export function guessOut(text) {
  const t = String(text || '').toLowerCase();
  if (/\bhmrc\b|corporation tax/.test(t)) return 'pay:tax:Paid to HMRC';
  for (const k of ['scott', 'tom', 'ben', 'ronnie']) if (new RegExp(`\\b${k}\\b`).test(t)) return `pay:${k}:Bank transfer`;
  /* Most particular first: a Dart Charge is the car, not a bank charge. */
  const kinds = [[/google/, 'Google Ads'], [/\bshell\b|\bbp\b|esso|texaco|fuel|petrol|parking|dart charge|\btfl\b|ulez/, 'Vehicle and fuel'],
    [/\btide\b|bank fee|bank charge|service charge/, 'Bank fees'], [/twilio|vercel|neon|openai|microsoft|godaddy|github|adobe|apple\.com/, 'Software'],
    [/insur|hiscox|simply business/, 'Insurance'], [/vodafone|\bee\b|\bo2\b|\bthree\b|giffgaff/, 'Phone'], [/accountan/, 'Accountant']];
  const hit = kinds.find(([re]) => re.test(t));
  return hit ? `cost:${hit[1]}` : null;
}

const near = (a, b, days) => Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) <= days * DAY;
const shift = (d, days) => new Date(Date.parse(d + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);

/** The check: every line beside what it is in the logbook, then what is left to put right. */
export async function tideCheck(text) {
  const parsed = tideLines(text);
  if (parsed.error) return parsed;
  const { lines } = parsed;
  const days = lines.map((l) => l.day).sort();
  const from = days[0], to = days[days.length - 1];
  const [out, costs, jobs] = await Promise.all([
    query(`select id, person_key, amount_pence, paid_on::text as day, how, note, bank_ref from paid_out where removed_at is null and paid_on between $1::date - 10 and $2::date + 10`, [from, to]),
    query(`select id, amount_pence, spent_on::text as day, category, what, bank_ref from expenses where removed_at is null and spent_on between $1::date - 10 and $2::date + 10`, [from, to]),
    lines.some((l) => l.pence > 0) ? candidateJobs(shift(from, -10), { model: 'damp', key: 'damp', sites: ['dampscan', 'ati-london'] }) : []
  ]);
  /* Cash never went through the bank, so it is never matched to a line (nor expected on the statement). */
  const book = [
    ...out.filter((p) => !/^cash$/i.test(p.how || '')).map((p) => ({ kind: 'pay', id: Number(p.id), day: p.day, pence: Number(p.amount_pence), ref: p.bank_ref, label: `${NAMES[p.person_key] || p.person_key}${p.how ? ': ' + p.how : ''}`, how: p.how })),
    ...costs.map((e) => ({ kind: 'cost', id: Number(e.id), day: e.day, pence: Number(e.amount_pence), ref: e.bank_ref, label: e.category + (e.what ? ': ' + e.what : '') }))
  ];
  const used = new Set();
  const take = (b) => { used.add(b.kind + b.id); return { kind: b.kind, id: b.id, label: b.label }; };
  const result = lines.map((l) => {
    const hay = [l.what, l.reference, l.type].join(' ');
    if (l.pence > 0) {
      if (/\bstripe\b/i.test(hay)) return { ...l, status: 'payout' };
      /* Money a person paid back (a negative payment on Pay). */
      const back = book.find((b) => b.kind === 'pay' && !used.has(b.kind + b.id) && (b.ref === l.ref || (!b.ref && b.pence === -l.pence && near(b.day, l.day, 5))));
      if (back) return { ...l, status: 'matched', logbook: take(back) };
      const tx = { postedOn: l.day, amountPence: l.pence, description: l.what, reference: l.reference, counterparty: l.what };
      const scored = jobs.map((j) => ({ j, s: scoreJob(tx, j) })).filter((x) => x.s !== null).sort((a, b) => b.s - a.s);
      const [best, next] = scored;
      if (best && best.s >= 3 && (!next || next.s < best.s)) {
        const j = best.j, deposit = Math.ceil(j.surveyPricePence / 2);
        const ticked = Boolean(j.paidAt) || (Boolean(j.depositPaidAt) && l.pence <= deposit);
        return { ...l, status: ticked ? 'matched' : 'untick', survey: { id: j.id, name: j.customerName || 'Customer', postcode: j.postcode } };
      }
      return { ...l, status: 'unknown', maybe: scored.slice(0, 2).map((x) => ({ id: x.j.id, name: x.j.customerName || 'Customer', postcode: x.j.postcode })) };
    }
    const want = -l.pence;
    const exact = book.find((b) => b.ref === l.ref && !used.has(b.kind + b.id));
    const close = exact || book.find((b) => !b.ref && !used.has(b.kind + b.id) && b.pence === want && near(b.day, l.day, 5));
    return close ? { ...l, status: 'matched', logbook: take(close) } : { ...l, status: 'missing', guess: guessOut(hay) };
  });
  /* The logbook's own entries in these dates that no line accounts for: cash, or a mistake. */
  const notOnStatement = book.filter((b) => !used.has(b.kind + b.id) && b.day >= from && b.day <= to)
    .map((b) => ({ kind: b.kind, id: b.id, day: b.day, pence: b.pence, label: b.label }));
  await query(CHECKED, [to]).catch(() => {});
  const sum = (f) => lines.filter(f).reduce((t, l) => t + l.pence, 0);
  return {
    from, to, unreadable: parsed.unreadable, lines: result, notOnStatement,
    totals: { in: sum((l) => l.pence > 0), out: -sum((l) => l.pence < 0), lines: lines.length, matched: result.filter((l) => l.status === 'matched' || l.status === 'payout').length }
  };
}
