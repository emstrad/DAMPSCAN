/**
 * Reconciling a Tide line with a survey (the owner's ask, 16 Nov 2026: the
 * bank check made to work like Xero's). A customer's transfer, once matched,
 * is recorded on their survey as a payment (job_payments, external_ref
 * "tide:<line>", so the same statement uploaded twice records nothing twice),
 * dated the day the money arrived, and the deposit or paid in full ticks follow
 * from it, so Pay, their page and the stage all read it. A transfer and the
 * hand tick it stood for count once (lib/portal-view.js moneyOf). Every match
 * goes on the customer's history with who made it, and can be undone.
 *
 * A transfer older than two days never texts the customer (the texts rule);
 * a newer one sends the usual "payment received" text, as the bank feed did.
 */
import { query, queryOne } from './db.js';
import { moneyOf, referenceFor } from './portal-view.js';
import { textsAfterChange } from './texts.js';

const DAMP = ['dampscan', 'ati-london'];
const pounds = (p) => '£' + (p / 100).toFixed(p % 100 ? 2 : 0);
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ext = (ref) => `tide:${ref}`;
const LINE = /^[a-f0-9]{32}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const daysAgo = (day) => Math.round((Date.parse(londonToday() + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 86400000);

const JOB = `select j.*, coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
     + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence
   from jobs j where j.id = $1`;

/** Is this their own reference (KIM0042) in the line's words? */
export function ownReference(line, job) {
  const own = squash(referenceFor(job.customerName || job.customer_name, job.id));
  return Boolean(own) && squash([line.reference, line.what].join(' ')).includes(own);
}

/** The lines already reconciled, by line fingerprint, with their survey. */
export async function reconciled(refs) {
  if (!refs.length) return new Map();
  const rows = await query(`select p.external_ref, p.job_id, j.customer_name, j.customer_postcode from job_payments p join jobs j on j.id = p.job_id
      where p.external_ref = any($1::text[])`, [refs.map(ext)]);
  return new Map(rows.map((r) => [r.external_ref.slice(5), { id: Number(r.job_id), name: r.customer_name || 'Customer', postcode: r.customer_postcode }]));
}

/** Records one line on one survey: the payment, the ticks it earns, the history line. */
export async function reconcile({ ref, day, pence, reference, what }, jobId, by, { auto = false } = {}) {
  const p = Math.round(Number(pence));
  if (!LINE.test(String(ref || '')) || !DAY.test(String(day || '')) || !(p > 0)) return { error: 'That line could not be read.' };
  const j = await queryOne(JOB, [Number(jobId) || 0]);
  if (!j || !DAMP.includes(j.site)) return { error: 'Pick the survey it pays for.' };
  if (['cancelled', 'declined', 'refunded'].includes(j.status)) return { error: 'That survey is cancelled: send the money back from Tide instead.' };
  const before = moneyOf(j);
  const ledger = Number(j.paid_pence) || 0;
  const label = ledger === 0 && p < before.pricePence ? 'deposit' : ledger + p >= before.pricePence ? 'balance' : 'payment';
  const note = `Tide transfer${reference ? ', ref ' + String(reference).slice(0, 40) : ''}`;
  const ins = await queryOne(`insert into job_payments (job_id, amount_pence, paid_on, label, note, external_ref) values ($1, $2, $3, $4, $5, $6)
      on conflict (external_ref) where external_ref is not null do nothing returning id`, [j.id, p, day, label, note, ext(ref)]);
  if (!ins) return { ok: true, already: true };
  /* The ticks this money earns, dated when it arrived; a tick made by hand is never moved. */
  const after = moneyOf({ ...j, paid_pence: ledger + p });
  const set = [];
  if (after.depositPaid && !j.deposit_paid_at) set.push('deposit');
  if (after.paidInFull && !j.paid_at) set.push('paid');
  if (set.length) {
    await query(`update jobs set deposit_paid_at = case when $2 then coalesce(deposit_paid_at, ($3::date + time '12:00') at time zone 'Europe/London') else deposit_paid_at end,
        paid_at = case when $4 then coalesce(paid_at, ($3::date + time '12:00') at time zone 'Europe/London') else paid_at end, updated_at = now() where id = $1`,
      [j.id, set.includes('deposit'), day, set.includes('paid')]);
  }
  const words = `${pounds(p)} into Tide on ${day.split('-').reverse().join('/')}${reference ? ' (ref ' + String(reference).slice(0, 40) + ')' : ''} matched ${auto ? 'by its reference' : 'by ' + (by || 'the team')}`
    + (set.includes('paid') ? ': paid in full.' : set.includes('deposit') ? ': deposit paid.' : '.');
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: auto ? 'Bank check' : by || 'Team', how: 'note', note: words, tide: ref, ticked: set }])]);
  /* Old money is news to nobody: no text, and the text counter catches up so it never goes later. */
  if (daysAgo(day) <= 2) await textsAfterChange(j.id, { delayMs: 0, by: 'Bank' }).catch(() => {});
  else await query('update jobs set texted_paid_pence = greatest(coalesce(texted_paid_pence, 0), $2) where id = $1', [j.id, after.paidPence]).catch(() => {});
  return { ok: true, survey: { id: Number(j.id), name: j.customer_name || 'Customer', postcode: j.customer_postcode }, ticked: set };
}

/** Undoes a match: the payment off, and only the ticks that match set taken back. */
export async function unreconcile(ref, by) {
  if (!LINE.test(String(ref || ''))) return { error: 'Which line?' };
  const pay = await queryOne('delete from job_payments where external_ref = $1 returning job_id, amount_pence', [ext(ref)]);
  if (!pay) return { error: 'Already undone.' };
  const j = await queryOne('select sched_log from jobs where id = $1', [pay.job_id]);
  const entry = (Array.isArray(j && j.sched_log) ? j.sched_log : []).filter((e) => e && e.tide === ref).pop();
  const ticked = (entry && entry.ticked) || [];
  if (ticked.length) {
    await query(`update jobs set deposit_paid_at = case when $2 then null else deposit_paid_at end, paid_at = case when $3 then null else paid_at end, updated_at = now() where id = $1`,
      [pay.job_id, ticked.includes('deposit'), ticked.includes('paid')]);
  }
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [pay.job_id, JSON.stringify([{ at: new Date().toISOString(), by: by || 'Team', how: 'note', note: `Tide match of ${pounds(Number(pay.amount_pence))} undone.` }])]);
  return { ok: true };
}

/** Every survey a transfer could pay for: live, something still owed, newest first. */
export async function openSurveys() {
  const rows = await query(`select j.id, j.customer_name, j.customer_postcode, j.job_date::text as day, j.survey_price_pence, j.paid_at, j.deposit_paid_at, j.tick_deposit_pence, j.tick_paid_pence,
        coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0) as paid_pence
      from jobs j where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined', 'refunded', 'quoted') and j.survey_price_pence > 0
      order by j.job_date desc nulls first, j.id desc limit 300`, [DAMP]);
  return rows.map((j) => ({ j, m: moneyOf(j) })).filter((x) => !x.m.paidInFull)
    .map(({ j, m }) => ({ id: Number(j.id), name: j.customer_name || 'Customer', postcode: j.customer_postcode, day: j.day, owedPence: m.balancePence, depositPence: m.depositPence, ref: referenceFor(j.customer_name, j.id) }));
}
