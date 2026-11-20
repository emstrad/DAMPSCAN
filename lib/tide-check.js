/**
 * The bank check (the owners' plan, 15 Nov 2026; reconciling like Xero, the
 * owner's ask, 16 Nov 2026): the company account is Tide, which has no feed,
 * so its statement (CSV, any dates, as often as liked) is uploaded on Company
 * and every line is put beside the logbook. A customer's transfer carrying
 * their own reference (KIM0042) is reconciled there and then: recorded on
 * their survey, ticked, kept on their history (lib/tide-reconcile.js). Any
 * other money in comes with its likeliest survey for one tap, OK; money out
 * goes beside a payment on Pay or an expense; what is left is listed to be
 * put right in one tap (each remembering its line in bank_ref or external_ref).
 * Tide's Status column is read (the owner, 20 Nov 2026): a cancelled, declined
 * or reversed line moved no money and is set aside, a pending one waits until
 * it clears; a refund is paired with the payment it gave back; a move to or
 * from the Tide savings account is the company's own money, and can be counted
 * into or out of the tax pot in one tap. Nothing else from the file is stored.
 */
import { createHash } from 'node:crypto';
import { query } from './db.js';

/* How far the statements checked reach (cron_beats 'bank_check_to'), so Overview can say when last month's check is still to do. */
const CHECKED = `insert into cron_beats (name, at) values ('bank_check_to', $1::date) on conflict (name) do update set at = greatest(cron_beats.at, excluded.at)`;
import { parseCsv, toPence, splitDate } from './bank/csv.js';
import { scoreJob } from './bank/match.js';
import { candidateJobs } from './bank/ledger.js';
import { NAMES } from './pay-book.js';
import { reconcile, reconciled, ownReference, openSurveys } from './tide-reconcile.js';

/* Every name Tide (and a bank like it) has used for a column, most specific first. */
const COLS = {
  id: ['transaction id', 'id'],
  day: ['date', 'transaction date', 'posted date', 'completed date', 'timestamp'],
  what: ['transaction description', 'description', 'details', 'name', 'merchant', 'payee', 'counterparty'],
  reference: ['reference', 'payment reference'],
  type: ['transaction type', 'payment type', 'type'],
  amount: ['amount', 'amount (gbp)', 'value'],
  in: ['paid in', 'money in', 'credit', 'amount in'],
  out: ['paid out', 'money out', 'debit', 'amount out'],
  status: ['status', 'state'],
  from: ['from'],
  to: ['to']
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
    lines.push({ ref: createHash('sha256').update(`${base}|${n}`).digest('hex').slice(0, 32), day, pence, what, reference, type: cell(row, 'type'),
      state: cell(row, 'status'), from: cell(row, 'from'), to: cell(row, 'to') });
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

/* Tide's Status column: a line cancelled, declined or reversed never moved money; a pending one may still change. */
export const voided = (l) => /cancel|declin|revers|fail|reject|void|return/i.test(l.state || '');
export const pending = (l) => /pending|processing|authoris/i.test(l.state || '');
/* A move between the Tide account and its savings account: the company's own money, not a cost or a customer. */
export const savingsMove = (l) => /savings/i.test([l.what, l.from, l.to].join(' ')) || /fundstransfer/i.test(l.type || '');
const refundIn = (l) => l.pence > 0 && /refund/i.test([l.type, l.what].join(' '));
const firstWord = (t) => (String(t || '').toLowerCase().match(/[a-z0-9]{3,}/) || [''])[0];

/** Refunds paired with the payment out they gave back (same amount, same payee's first word), as ref to the other line. Pure. */
export function refundPairs(lines) {
  const pairs = new Map();
  for (const r of lines.filter(refundIn)) {
    const paid = lines.find((o) => o.pence === -r.pence && !pairs.has(o.ref) && firstWord(o.what) === firstWord(r.what));
    pairs.set(r.ref, paid ? paid.ref : null);
    if (paid) pairs.set(paid.ref, r.ref);
  }
  return pairs;
}

const near = (a, b, days) => Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) <= days * DAY;
const shift = (d, days) => new Date(Date.parse(d + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);

/** The check: every line beside what it is in the logbook, then what is left to put right. */
export async function tideCheck(text, by = null) {
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
  const done = await reconciled(lines.filter((l) => l.pence > 0).map((l) => l.ref));
  const pairs = refundPairs(lines.filter((l) => !voided(l)));
  const result = [];
  for (const l of lines) {
    const r = await place(l);
    /* Still pending at Tide: nothing to decide until it clears. */
    result.push(pending(l) && ['suggest', 'unknown', 'missing'].includes(r.status) ? { ...r, status: 'pending' } : r);
  }
  async function place(l) {
    const hay = [l.what, l.reference, l.type].join(' ');
    if (voided(l)) return { ...l, status: 'void' };
    if (pairs.has(l.ref)) {
      const other = lines.find((o) => o.ref === pairs.get(l.ref));
      return { ...l, status: 'refund', pair: other ? { day: other.day, what: other.what, pence: other.pence } : null };
    }
    /* Already recorded from this very line (into or out of the tax pot, a cost, a payment): matched. */
    const own = book.find((b) => b.ref === l.ref && !used.has(b.kind + b.id));
    if (own) return { ...l, status: 'matched', logbook: take(own) };
    if (savingsMove(l)) return { ...l, status: 'savings' };
    if (l.pence > 0) {
      if (/\bstripe\b/i.test(hay)) return { ...l, status: 'payout' };
      if (done.has(l.ref)) return { ...l, status: 'reconciled', survey: done.get(l.ref) };
      /* Their own reference, typed as their page shows it: reconciled without asking. */
      const mine = jobs.filter((j) => ownReference(l, j));
      if (mine.length === 1) {
        const r = await reconcile(l, mine[0].id, by, { auto: true }).catch(() => null);
        if (r && r.ok && r.survey) return { ...l, status: 'auto', survey: r.survey, ticked: r.ticked };
      }
      /* Money a person paid back (a negative payment on Pay). */
      const back = book.find((b) => b.kind === 'pay' && !used.has(b.kind + b.id) && (b.ref === l.ref || (!b.ref && b.pence === -l.pence && near(b.day, l.day, 5))));
      if (back) return { ...l, status: 'matched', logbook: take(back) };
      const tx = { postedOn: l.day, amountPence: l.pence, description: l.what, reference: l.reference, counterparty: l.what };
      const scored = jobs.map((j) => ({ j, s: scoreJob(tx, j) })).filter((x) => x.s !== null).sort((a, b) => b.s - a.s);
      const [best, next] = scored;
      if (best && best.s >= 3 && (!next || next.s < best.s)) {
        const j = best.j, deposit = Math.ceil(j.surveyPricePence / 2);
        /* Already in the books only when a tick has no money recorded behind it (the money audit, 16 Nov 2026):
           a balance after a reconciled deposit is new money to record, not "matched". */
        const got = j.receivedPence || 0;
        const ticked = (Boolean(j.paidAt) && got < j.surveyPricePence) || (Boolean(j.depositPaidAt) && l.pence <= deposit && got < deposit);
        return { ...l, status: ticked ? 'matched' : 'suggest', survey: { id: j.id, name: j.customerName || 'Customer', postcode: j.postcode } };
      }
      return { ...l, status: 'unknown', maybe: scored.slice(0, 2).map((x) => ({ id: x.j.id, name: x.j.customerName || 'Customer', postcode: x.j.postcode })) };
    }
    const want = -l.pence;
    const exact = book.find((b) => b.ref === l.ref && !used.has(b.kind + b.id));
    const close = exact || book.find((b) => !b.ref && !used.has(b.kind + b.id) && b.pence === want && near(b.day, l.day, 5));
    return close ? { ...l, status: 'matched', logbook: take(close) } : { ...l, status: 'missing', guess: guessOut(hay) };
  }
  /* The logbook's own entries in these dates that no line accounts for: cash, or a mistake. */
  const notOnStatement = book.filter((b) => !used.has(b.kind + b.id) && b.day >= from && b.day <= to)
    .map((b) => ({ kind: b.kind, id: b.id, day: b.day, pence: b.pence, label: b.label, refunded: Boolean(b.ref && pairs.has(b.ref)) }));
  await query(CHECKED, [to]).catch(() => {});
  const real = lines.filter((l) => !voided(l));
  const sum = (f) => real.filter(f).reduce((t, l) => t + l.pence, 0);
  const settled = ['matched', 'payout', 'reconciled', 'auto', 'savings', 'refund'];
  const count = (st) => result.filter((l) => st.includes(l.status)).length;
  /* The picker for "Find and match": only when a transfer still needs a survey. */
  const open = result.some((l) => l.status === 'suggest' || l.status === 'unknown') ? await openSurveys() : [];
  return {
    from, to, unreadable: parsed.unreadable, lines: result, notOnStatement, open,
    totals: { in: sum((l) => l.pence > 0), out: -sum((l) => l.pence < 0), lines: real.length - count(['pending']), matched: count(settled), pending: count(['pending']), void: count(['void']),
      toSavings: -sum((l) => l.pence < 0 && savingsMove(l)), fromSavings: sum((l) => l.pence > 0 && savingsMove(l)) }
  };
}
