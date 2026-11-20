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
 * came in (Stripe, Tide, or Revolut), so the split in Tide is clear. A survey
 * joins the new book by where its money came in, not when it was ticked: a
 * card payment or a Tide line reconciled to it, or a tick by hand from the day
 * after the cut-over (the owner, 16 Nov 2026: Revolut payments caught up with
 * ticks on the evening of the 15th belong to the Revolut book).
 */
import { query, queryOne } from './db.js';
import { calcJob, cleanShares, splitBy, PEOPLE } from './splits.js';

export const WHO = ['tax', 'scott', 'tom', 'ben', 'ronnie'];
export const NAMES = { tax: 'Corp tax', scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };
const DAMP = ['dampscan', 'ati-london'];
export const CUTOVER = '2026-11-15';
export const BOOKS = ['new', 'old'];
const bookOn = (day) => (day && day < CUTOVER ? 'old' : 'new');
/* Ticks by hand on the cut-over day itself were Revolut money caught up. */
const TICKS_FROM = '2026-11-16';
const london = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : null);

/* Every damp survey done (its day has come, or marked completed), paid or not, with its card fees. */
const JOB = `select j.id, j.site, j.customer_name, j.customer_postcode, j.job_date::text as day, j.status, j.paid_at,
        j.survey_price_pence, j.surveyor, j.surveyor_fee_pence, j.tax_bp, j.lead_bp, j.lead_earner, j.partner_a, j.partner_b, j.shares,
        coalesce((select sum(p.fee_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)::bigint as fees,
        exists (select 1 from job_payments p where p.job_id = j.id and p.external_ref like 'stripe:%') as stripe,
        exists (select 1 from job_payments p where p.job_id = j.id and p.external_ref like 'tide:%') as tide
      from jobs j`;

/** Which book a survey's money is in: where it came in, not when it was ticked. */
export function bookOf(j) {
  return !j.paid_at || j.stripe || j.tide || london(j.paid_at) >= TICKS_FROM ? 'new' : 'old';
}

/** One survey's split by its own rates (shares, or the old waterfall), before any money is moved by hand. */
export function shareOf(j, settings) {
  const fees = Number(j.fees) || 0;
  const valid = (p) => PEOPLE.includes(p);
  const c = calcJob({
    surveyPence: Math.max(0, Number(j.survey_price_pence) - fees), surveyorFeePence: j.surveyor ? Number(j.surveyor_fee_pence) || 0 : 0, surveyor: j.surveyor, /* no surveyor, no fee going to nobody */
    taxBp: j.tax_bp ?? settings.taxBp, leadBp: j.lead_bp ?? settings.leadBp,
    leadEarner: valid(j.lead_earner) ? j.lead_earner : settings.leadEarner,
    partners: valid(j.partner_a) && valid(j.partner_b) ? [j.partner_a, j.partner_b] : [settings.partnerA, settings.partnerB],
    shares: j.shares
  });
  const share = { tax: c.survey.tax };
  for (const k of ['scott', 'tom', 'ben', 'ronnie']) share[k] = c.pay[k] || 0;
  return { share, fees };
}

/** One survey's row (any date), for its own split in the job pop-up. */
export const surveyRow = (id) => queryOne(`${JOB} where j.id = $1`, [id]);

/* Every damp survey done (its day has come, or marked completed), paid or not, with its card fees,
   and any money moved by hand between people on it (lib/pay-moves.js). */
export async function surveysDone(settings) {
  const [rows, moved] = await Promise.all([
    query(`${JOB}
     where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined', 'refunded', 'quoted')
       and j.date_set and (j.status = 'completed' or j.job_date <= (now() at time zone 'Europe/London')::date)
     order by coalesce(j.paid_at, j.job_date::timestamptz) desc, j.id desc`, [DAMP]),
    query('select job_id, from_key, to_key, pence from job_pay_moves where removed_at is null')
  ]);
  return rows.map((j) => {
    const { share, fees } = shareOf(j, settings);
    const mine = moved.filter((m) => Number(m.job_id) === Number(j.id));
    for (const m of mine) { share[m.from_key] -= Number(m.pence); share[m.to_key] += Number(m.pence); }
    const paidOn = london(j.paid_at);
    const book = bookOf(j);
    return { id: Number(j.id), site: j.site, name: j.customer_name || 'Customer', postcode: j.customer_postcode, day: j.day,
      paid: Boolean(j.paid_at), paidOn, book, via: book === 'old' ? 'Revolut' : j.stripe ? 'Stripe' : 'Tide', price: Number(j.survey_price_pence), fees, share,
      surveyor: j.surveyor || null, surveyorFee: j.surveyor ? Math.min(Number(j.surveyor_fee_pence) || 0, share[j.surveyor] || 0) : 0,
      moved: mine.length, odd: Object.values(share).some((v) => v < 0) };
  });
}

export async function splitSettings() {
  const s = await queryOne('select tax_bp, lead_bp, lead_earner, partner_a, partner_b, shares, updated_at from job_settings where id').catch(() => null) || {};
  return { taxBp: s.tax_bp ?? 2000, leadBp: s.lead_bp ?? 1500, leadEarner: s.lead_earner || 'scott', partnerA: s.partner_a || 'tom', partnerB: s.partner_b || 'ben',
    shares: cleanShares(s.shares), updatedAt: s.updated_at || null };
}

/** New surveys book with these; ones already booked keep the rates they were booked at. */
export async function setSplit({ taxBp, leadBp, leadEarner, partnerA, partnerB, shares }) {
  const bp = (n) => Number.isInteger(n) && n >= 0 && n <= 10000;
  if (shares !== undefined) {
    const clean = cleanShares(shares);
    if (!bp(taxBp)) return { error: 'Tax must be between 0 and 100%.' };
    if (!clean) return { error: 'Scott, Tom and Ben must add up to 100%.' };
    await query('update job_settings set tax_bp = $1, shares = $2::jsonb, lead_bp = 0, updated_at = now() where id', [taxBp, JSON.stringify(clean)]);
    return { ok: true, settings: await splitSettings() };
  }
  if (!bp(taxBp) || !bp(leadBp)) return { error: 'Percentages must be between 0 and 100.' };
  if (![leadEarner, partnerA, partnerB].every((p) => PEOPLE.includes(p))) return { error: 'Pick Scott, Tom or Ben.' };
  if (partnerA === partnerB) return { error: 'The two partners must be different people.' };
  await query('update job_settings set tax_bp = $1, lead_bp = $2, lead_earner = $3, partner_a = $4, partner_b = $5, updated_at = now() where id', [taxBp, leadBp, leadEarner, partnerA, partnerB]);
  return { ok: true, settings: await splitSettings() };
}

/* Running costs come off before anyone is owed (the owner, 20 Nov 2026: Pay showed more owed than the
   company had once Ads and software were paid): every cost logged on Money from the cut-over, month by month,
   shared Scott, Tom and Ben by the split. Ronnie is paid his fee alone; tax is set aside on the price. */
const COST_SHARES = { scott: 4000, tom: 4000, ben: 2000 };
export async function runningCosts(settings) {
  const shares = (settings && settings.shares) || COST_SHARES;
  const rows = await query(`select to_char(spent_on, 'YYYY-MM') as m, sum(amount_pence)::bigint as pence from expenses
     where removed_at is null and spent_on >= $1::date group by 1 order by 1`, [CUTOVER]).catch(() => []);
  const months = rows.map((r) => ({ month: r.m, pence: Number(r.pence), each: splitBy(Number(r.pence), shares) }));
  const total = Object.fromEntries(WHO.map((k) => [k, months.reduce((t, m) => t + (m.each[k] || 0), 0)]));
  return { months, total, pence: months.reduce((t, m) => t + m.pence, 0) };
}

async function paidOut() {
  return (await query(`select id, person_key, amount_pence, paid_on::text as day, how, note, added_by, created_at, book from paid_out
     where removed_at is null order by paid_on desc, id desc`)).map((r) => ({ id: Number(r.id), who: r.person_key, pence: Number(r.amount_pence), day: r.day, how: r.how, note: r.note, by: r.added_by,
      book: BOOKS.includes(r.book) ? r.book : bookOn(r.day) }));
}

/** The page: a card per person (owed now, earned, paid, coming), and every survey done in the period. */
export async function payBook({ from = null, to = null, book = 'new' } = {}) {
  const settings = await splitSettings();
  const [all, allOut, costs] = await Promise.all([surveysDone(settings), paidOut(), runningCosts(settings)]);
  const inBook = (b) => (x) => x.book === b;
  /* Costs belong to the new book: the Revolut book is kept as it was paid. */
  const costOf = (b, k) => (b === 'new' ? costs.total[k] || 0 : 0);
  const owedIn = (b) => WHO.reduce((t, k) => t + Math.max(0, all.filter(inBook(b)).filter((s) => s.paid).reduce((n, s) => n + s.share[k], 0) - costOf(b, k) - allOut.filter(inBook(b)).filter((p) => p.who === k).reduce((n, p) => n + p.pence, 0)), 0);
  /* The other book in one line, so neither is ever out of sight. */
  const other = book === 'new' ? 'old' : 'new';
  const surveys = all.filter(inBook(book)), out = allOut.filter(inBook(book));
  const cards = WHO.map((k) => {
    const earned = surveys.filter((s) => s.paid).reduce((t, s) => t + s.share[k], 0);
    const paid = out.filter((p) => p.who === k).reduce((t, p) => t + p.pence, 0);
    const coming = surveys.filter((s) => !s.paid).reduce((t, s) => t + s.share[k], 0);
    const last = out.find((p) => p.who === k);
    const cost = costOf(book, k);
    return { key: k, name: NAMES[k], owed: earned - cost - paid, earned, costs: cost, paid, coming, lastPaid: last ? { day: last.day, pence: last.pence } : null };
  });
  const inRange = (s) => { const d = s.paidOn || s.day; return (!from || d >= from) && (!to || d <= to); };
  const rows = surveys.filter(inRange);
  const sum = (list, f) => list.reduce((t, s) => t + f(s), 0);
  const totals = { price: sum(rows, (s) => s.price), fees: sum(rows, (s) => s.fees) };
  for (const k of WHO) totals[k] = sum(rows.filter((s) => s.paid), (s) => s.share[k]);
  /* The check: what came in, less fees, is exactly what the shares add up to. */
  const paidRows = rows.filter((s) => s.paid);
  const check = { in: sum(paidRows, (s) => s.price - s.fees), out: sum(paidRows, (s) => WHO.reduce((t, k) => t + s.share[k], 0)) };
  return { book, cutover: CUTOVER, other: { book: other, owed: owedIn(other) }, cards, rows, totals, check, settings, costs: book === 'new' ? costs.pence : 0 };
}

/** One person's statement: what each survey earned them and what was paid, newest first, with the running balance. */
export async function statement(who) {
  if (!WHO.includes(who)) return { error: 'Who?' };
  const settings = await splitSettings();
  const [surveys, out, costs] = await Promise.all([surveysDone(settings), paidOut(), runningCosts(settings)]);
  /* The month's share of the running costs, dated its last day (or today for this month). */
  const today = london(new Date());
  const monthEnd = (m) => { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); const e = d.toISOString().slice(0, 10); return e > today ? today : e; };
  const costLines = costs.months.filter((m) => m.each[who]).map((m) => ({ kind: 'cost', day: monthEnd(m.month), pence: -m.each[who], via: 'Tide',
    what: `Running costs, ${new Date(m.month + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} (${Math.round((m.each[who] / m.pence) * 100)}% of £${(m.pence / 100).toFixed(2)})` }));
  /* Each book keeps its own running balance: the new one starts from nothing on the cut-over. */
  const ledger = (b) => {
    const lines = [
      ...surveys.filter((s) => s.paid && s.book === b && s.share[who]).map((s) => ({ kind: 'earned', day: s.paidOn, pence: s.share[who], jobId: s.id, via: s.via, what: `${s.name}${s.postcode ? ', ' + s.postcode : ''}` })),
      ...(b === 'new' ? costLines : []),
      ...out.filter((p) => p.who === who && p.book === b).map((p) => ({ kind: 'paid', day: p.day, pence: -p.pence, id: p.id, via: b === 'old' ? 'Revolut' : 'Tide', what: [p.how || 'Paid', p.note].filter(Boolean).join(': '), by: p.by }))
    ].sort((a, c) => (a.day < c.day ? -1 : a.day > c.day ? 1 : a.kind === 'earned' ? -1 : c.kind === 'earned' ? 1 : 0));
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
