/**
 * The pay logbook (the owners' brief, 15 Nov 2026): who is owed what for the
 * ATi and DampScan surveys, and what has been paid to them. The one source of
 * truth for paying people, worked out live from the surveys themselves.
 *
 * A survey counts once the customer has paid in full (jobs.paid_at). Its card
 * fees (Stripe, job_payments.fee_pence) come off the top first, absorbed by
 * everyone (the owners' choice), then the same waterfall the jobs have always
 * used (lib/splits.js, at the rates kept on each job): tax set aside, the lead
 * fee, the surveyor's fee, the rest to the two partners. A survey cancelled
 * after it was paid drops out, so the next payment takes it back.
 *
 * Paid out is the paid_out table: one row per payment to a person (or into the
 * tax pot), never edited, removed only with who and when.
 *
 * Two books (the owners' fresh start, 16 Nov 2026): the money moved from
 * Revolut, with its pots, to Tide and Stripe on 15 Nov 2026 (the first card
 * payment). A survey paid in full from then on, and a payment made from then
 * on, is in the new book, the one shown first; everything before stays in the
 * Revolut book, kept as it was, one tap away. Each survey says where its money
 * came in (Stripe, Tide, or Revolut), so the split in Tide is clear.
 */
import { query, queryOne } from './db.js';
import { calcJob, PEOPLE } from './splits.js';

export const WHO = ['tax', 'scott', 'tom', 'ben', 'ronnie'];
export const NAMES = { tax: 'Corp tax', scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };
const DAMP = ['dampscan', 'ati-london'];
export const CUTOVER = '2026-11-15';
export const BOOKS = ['new', 'old'];
const bookOn = (day) => (day && day < CUTOVER ? 'old' : 'new');
const london = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : null);

/* Every damp survey done (its day has come, or marked completed), paid or not, with its card fees. */
export async function surveysDone(settings) {
  const rows = await query(`select j.id, j.site, j.customer_name, j.customer_postcode, j.job_date::text as day, j.status, j.paid_at,
        j.survey_price_pence, j.surveyor, j.surveyor_fee_pence, j.tax_bp, j.lead_bp, j.lead_earner, j.partner_a, j.partner_b,
        coalesce((select sum(p.fee_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)::bigint as fees,
        exists (select 1 from job_payments p where p.job_id = j.id and p.external_ref like 'stripe:%') as stripe
      from jobs j
     where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined', 'refunded', 'quoted')
       and j.date_set and (j.status = 'completed' or j.job_date <= (now() at time zone 'Europe/London')::date)
     order by coalesce(j.paid_at, j.job_date::timestamptz) desc, j.id desc`, [DAMP]);
  return rows.map((j) => {
    const fees = Number(j.fees) || 0;
    const valid = (p) => PEOPLE.includes(p);
    const c = calcJob({
      surveyPence: Math.max(0, Number(j.survey_price_pence) - fees), surveyorFeePence: Number(j.surveyor_fee_pence) || 0, surveyor: j.surveyor,
      taxBp: j.tax_bp ?? settings.taxBp, leadBp: j.lead_bp ?? settings.leadBp,
      leadEarner: valid(j.lead_earner) ? j.lead_earner : settings.leadEarner,
      partners: valid(j.partner_a) && valid(j.partner_b) ? [j.partner_a, j.partner_b] : [settings.partnerA, settings.partnerB]
    });
    const share = { tax: c.survey.tax };
    for (const k of ['scott', 'tom', 'ben', 'ronnie']) share[k] = c.pay[k] || 0;
    const paidOn = london(j.paid_at), book = j.paid_at ? bookOn(paidOn) : 'new';
    return { id: Number(j.id), site: j.site, name: j.customer_name || 'Customer', postcode: j.customer_postcode, day: j.day,
      paid: Boolean(j.paid_at), paidOn, book, via: book === 'old' ? 'Revolut' : j.stripe ? 'Stripe' : 'Tide', price: Number(j.survey_price_pence), fees, share,
      odd: Object.values(share).some((v) => v < 0) };
  });
}

export async function splitSettings() {
  const s = await queryOne('select tax_bp, lead_bp, lead_earner, partner_a, partner_b, updated_at from job_settings where id').catch(() => null) || {};
  return { taxBp: s.tax_bp ?? 2000, leadBp: s.lead_bp ?? 1500, leadEarner: s.lead_earner || 'scott', partnerA: s.partner_a || 'tom', partnerB: s.partner_b || 'ben', updatedAt: s.updated_at || null };
}

/** New surveys book with these; ones already booked keep the rates they were booked at. */
export async function setSplit({ taxBp, leadBp, leadEarner, partnerA, partnerB }) {
  const bp = (n) => Number.isInteger(n) && n >= 0 && n <= 10000;
  if (!bp(taxBp) || !bp(leadBp)) return { error: 'Percentages must be between 0 and 100.' };
  if (![leadEarner, partnerA, partnerB].every((p) => PEOPLE.includes(p))) return { error: 'Pick Scott, Tom or Ben.' };
  if (partnerA === partnerB) return { error: 'The two partners must be different people.' };
  await query('update job_settings set tax_bp = $1, lead_bp = $2, lead_earner = $3, partner_a = $4, partner_b = $5, updated_at = now() where id', [taxBp, leadBp, leadEarner, partnerA, partnerB]);
  return { ok: true, settings: await splitSettings() };
}

async function paidOut() {
  return (await query(`select id, person_key, amount_pence, paid_on::text as day, how, note, added_by, created_at, book from paid_out
     where removed_at is null order by paid_on desc, id desc`)).map((r) => ({ id: Number(r.id), who: r.person_key, pence: Number(r.amount_pence), day: r.day, how: r.how, note: r.note, by: r.added_by,
      book: BOOKS.includes(r.book) ? r.book : bookOn(r.day) }));
}

/** The page: a card per person (owed now, earned, paid, coming), and every survey done in the period. */
export async function payBook({ from = null, to = null, book = 'new' } = {}) {
  const settings = await splitSettings();
  const [all, allOut] = await Promise.all([surveysDone(settings), paidOut()]);
  const inBook = (b) => (x) => x.book === b;
  const owedIn = (b) => WHO.reduce((t, k) => t + Math.max(0, all.filter(inBook(b)).filter((s) => s.paid).reduce((n, s) => n + s.share[k], 0) - allOut.filter(inBook(b)).filter((p) => p.who === k).reduce((n, p) => n + p.pence, 0)), 0);
  /* The other book in one line, so neither is ever out of sight. */
  const other = book === 'new' ? 'old' : 'new';
  const surveys = all.filter(inBook(book)), out = allOut.filter(inBook(book));
  const cards = WHO.map((k) => {
    const earned = surveys.filter((s) => s.paid).reduce((t, s) => t + s.share[k], 0);
    const paid = out.filter((p) => p.who === k).reduce((t, p) => t + p.pence, 0);
    const coming = surveys.filter((s) => !s.paid).reduce((t, s) => t + s.share[k], 0);
    const last = out.find((p) => p.who === k);
    return { key: k, name: NAMES[k], owed: earned - paid, earned, paid, coming, lastPaid: last ? { day: last.day, pence: last.pence } : null };
  });
  const inRange = (s) => { const d = s.paidOn || s.day; return (!from || d >= from) && (!to || d <= to); };
  const rows = surveys.filter(inRange);
  const sum = (list, f) => list.reduce((t, s) => t + f(s), 0);
  const totals = { price: sum(rows, (s) => s.price), fees: sum(rows, (s) => s.fees) };
  for (const k of WHO) totals[k] = sum(rows.filter((s) => s.paid), (s) => s.share[k]);
  /* The check: what came in, less fees, is exactly what the shares add up to. */
  const paidRows = rows.filter((s) => s.paid);
  const check = { in: sum(paidRows, (s) => s.price - s.fees), out: sum(paidRows, (s) => WHO.reduce((t, k) => t + s.share[k], 0)) };
  return { book, cutover: CUTOVER, other: { book: other, owed: owedIn(other) }, cards, rows, totals, check, settings };
}

/** One person's statement: what each survey earned them and what was paid, newest first, with the running balance. */
export async function statement(who) {
  if (!WHO.includes(who)) return { error: 'Who?' };
  const settings = await splitSettings();
  const [surveys, out] = await Promise.all([surveysDone(settings), paidOut()]);
  /* Each book keeps its own running balance: the new one starts from nothing on the cut-over. */
  const ledger = (b) => {
    const lines = [
      ...surveys.filter((s) => s.paid && s.book === b && s.share[who]).map((s) => ({ kind: 'earned', day: s.paidOn, pence: s.share[who], jobId: s.id, via: s.via, what: `${s.name}${s.postcode ? ', ' + s.postcode : ''}` })),
      ...out.filter((p) => p.who === who && p.book === b).map((p) => ({ kind: 'paid', day: p.day, pence: -p.pence, id: p.id, via: b === 'old' ? 'Revolut' : 'Tide', what: [p.how || 'Paid', p.note].filter(Boolean).join(': '), by: p.by }))
    ].sort((a, c) => (a.day < c.day ? -1 : a.day > c.day ? 1 : a.kind === 'earned' ? -1 : 1));
    let run = 0;
    for (const l of lines) { run += l.pence; l.balance = run; }
    return { owed: run, lines: lines.reverse() };
  };
  const now = ledger('new'), was = ledger('old');
  const coming = surveys.filter((s) => !s.paid && s.share[who]).map((s) => ({ jobId: s.id, pence: s.share[who], what: `${s.name}${s.postcode ? ', ' + s.postcode : ''}` }));
  return { who, name: NAMES[who], cutover: CUTOVER, owed: now.owed, lines: now.lines, coming, old: was };
}

export async function recordPayout({ who, pence, day, how, note, bankRef, book }, by) {
  if (!WHO.includes(who)) return { error: 'Who was paid?' };
  const p = Math.round(Number(pence));
  if (!Number.isFinite(p) || p === 0 || Math.abs(p) > 100000000) return { error: 'Enter the amount paid.' };
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : london(new Date());
  /* Settling an old Revolut balance today still belongs to the Revolut book. */
  const row = await queryOne(`insert into paid_out (person_key, amount_pence, paid_on, how, note, added_by, bank_ref, book) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [who, p, on, String(how || '').slice(0, 40) || null, String(note || '').slice(0, 200) || null, by || null, /^[a-f0-9]{32}$/.test(String(bankRef || '')) ? bankRef : null, book === 'old' ? 'old' : bookOn(on)]);
  return { ok: true, id: Number(row.id) };
}

/** A payment entered by mistake comes off, kept with who removed it. */
export async function removePayout(id, by) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) return { error: 'Which one?' };
  const r = await queryOne('update paid_out set removed_at = now(), removed_by = $2 where id = $1 and removed_at is null returning id', [Number(id), by || null]);
  return r ? { ok: true } : { error: 'Already removed.' };
}
