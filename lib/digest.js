/**
 * The morning digest: one push per business that has something to say.
 *
 * What it says, in order: what is on tomorrow, what is waiting, what is owed,
 * and what happened since the last digest. Counts and amounts only. The rows
 * it summarises are stamped so the next morning starts where this one left
 * off, and a business with nothing to report gets no push at all, because a
 * daily "nothing" teaches a phone to ignore the topic.
 */
import { query } from './db.js';
import { push } from './notify.js';
import { TODAY } from './today.js';

const TOMORROW = `(${TODAY} + 1)`;
const N = (v) => Number(v) || 0;
const pounds = (pence) => `£${(N(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const KIND_WORDS = {
  job_created: ['job saved', 'jobs saved'],
  job_status: ['job changed state', 'jobs changed state'],
  payment: ['payment received', 'payments received'],
  payout_frozen: ['payout frozen', 'payouts frozen'],
  payout_reopened: ['payout reopened', 'payouts reopened']
};

/** The lines of one business's digest, or an empty list. */
export async function digestFor(business) {
  const site = business.slug;
  const lines = [];
  const due = await query(
    `select count(*) filter (where job_date = ${TOMORROW}) as tomorrow,
            count(*) filter (where job_date = ${TODAY}) as today
       from jobs where site = $1 and status = 'booked'`, [site]);
  if (N(due[0].today)) lines.push(`${plural(N(due[0].today), 'job', 'jobs')} today.`);
  if (N(due[0].tomorrow)) lines.push(`${plural(N(due[0].tomorrow), 'job', 'jobs')} tomorrow.`);

  if (business.payout_model !== 'damp') {
    const waiting = await query(
      `select count(*) filter (where status = 'quoted' and created_at < now() - interval '7 days') as stale_quotes,
              count(*) filter (where status = 'completed' and payout_frozen_at is null) as unpaid,
              coalesce(sum(invoice_net_pence - coalesce(r.received, 0)) filter (where status = 'completed' and payout_frozen_at is null), 0) as owed
         from jobs j
         left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
        where j.site = $1`, [site]);
    const w = waiting[0];
    if (N(w.stale_quotes)) lines.push(`${plural(N(w.stale_quotes), 'quote', 'quotes')} out over a week with no answer.`);
    if (N(w.unpaid)) lines.push(`${pounds(w.owed)} outstanding on ${plural(N(w.unpaid), 'completed job', 'completed jobs')}.`);
  }

  const svc = await query(
    `select count(*) filter (where next_due_on < ${TODAY}) as overdue, count(*) filter (where next_due_on between ${TODAY} and ${TODAY} + 30) as soon
       from service_contracts where business_slug = $1 and status = 'active'`, [site]);
  if (N(svc[0].overdue)) lines.push(`${plural(N(svc[0].overdue), 'service', 'services')} overdue.`);
  if (N(svc[0].soon)) lines.push(`${plural(N(svc[0].soon), 'service due', 'services due')} in the next month.`);

  const since = await query(
    `select kind, count(*) as n from notifications where business_slug = $1 and digest_sent_at is null group by kind order by kind`, [site]);
  if (since.length) {
    lines.push('Since the last digest: ' + since.map((r) => {
      const words = KIND_WORDS[r.kind] || [r.kind, r.kind];
      return plural(N(r.n), words[0], words[1]);
    }).join(', ') + '.');
  }
  return lines;
}

/** Runs the digest for every active business. Returns what was sent. */
export async function runDigest() {
  const businesses = await query('select slug, name, payout_model from businesses where active order by slug');
  const sent = [];
  for (const b of businesses) {
    const lines = await digestFor(b);
    if (!lines.length) continue;
    const ok = await push({ title: `${b.name}: this morning`, message: lines.join(' '), tags: 'sunrise' });
    await query('update notifications set digest_sent_at = now() where business_slug = $1 and digest_sent_at is null', [b.slug]);
    sent.push({ business: b.slug, lines, pushed: ok });
  }
  return { ok: true, sent };
}
