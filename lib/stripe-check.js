/**
 * The hourly card check (the owner, 19 Nov 2026: "what makes it world class":
 * code for anything with a right answer, never a model reading two lists).
 * Every Stripe payment of the last week is put beside its survey, to the penny:
 *
 *   not recorded   Stripe took it, no survey shows it (half an hour's grace,
 *                  for the notice and the hourly sweep of open orders)
 *   amount         recorded for a different amount
 *   refund         Stripe refunded more than the survey shows as refunded
 *   dispute        the customer's bank disputed it
 *   no survey      a payment with no survey number on it at all
 *
 * Read only: it never touches Stripe and never moves money. Each problem makes
 * one owners' to-do ("Card check") and is kept in stripe_issues; once it lines
 * up again the to-do closes itself, saying why. The run's result is kept in
 * check_runs for What's next, Settings and the morning brief.
 */
import { query, queryOne } from './db.js';
import { stripeOn } from './stripe-pay.js';

const API = 'https://api.stripe.com/v1';
const DAY = 86400000;
const GRACE = 30 * 60000;
const pounds = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
const who = (j) => `${String(j.customer_name || 'the customer').trim().split(/\s+/)[0]}${j.customer_postcode ? ' (' + String(j.customer_postcode).split(' ')[0] + ')' : ''}`;

async function list(path, fetchImpl) {
  const out = [];
  let after = null;
  for (let page = 0; page < 5; page += 1) {
    const r = await fetchImpl(`${API}${path}${after ? `&starting_after=${after}` : ''}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(15000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe said ${r.status}`);
    out.push(...(data.data || []));
    if (!data.has_more || !data.data || !data.data.length) break;
    after = data.data[data.data.length - 1].id;
  }
  return out;
}

/** What the survey shows for one Stripe payment: paid in and refunded back, in pence. */
async function recorded(pi, jobId) {
  const r = await queryOne(`select
      coalesce((select sum(p.amount_pence) from job_payments p where p.label <> 'refund' and (p.external_ref = 'stripe:' || $1
        or p.external_ref in (select 'stripe:' || o.order_id from pay_orders o where o.provider_ref = $1))), 0)::int as paid,
      coalesce((select -sum(p.amount_pence) from job_payments p where p.job_id = $2 and p.label = 'refund' and p.external_ref like 'stripe-refund:%'), 0)::int as refunded`, [pi, jobId]);
  return r || { paid: 0, refunded: 0 };
}

/** The problems with one succeeded payment, as [kind, words]. Pure, for the tests. */
export function problemsOf(pi, j, rec, now = Date.now()) {
  const amount = Number(pi.amount_received || pi.amount || 0);
  const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : {};
  const out = [];
  if (!j) return [['no_survey', `A card payment of ${pounds(amount)} on ${new Date(pi.created * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })} is not on any survey (Stripe ${pi.id}). Find whose it is and record it on their card.`]];
  if (!rec.paid && now - pi.created * 1000 > GRACE) out.push(['not_recorded', `${who(j)} paid ${pounds(amount)} by card but their survey does not show it. Open their card and check the payments.`]);
  else if (rec.paid && rec.paid !== amount) out.push(['amount', `${who(j)} paid ${pounds(amount)} by card but their survey shows ${pounds(rec.paid)} for it.`]);
  if (Number(ch.amount_refunded || 0) > rec.refunded) out.push(['refund', `Stripe refunded ${who(j)} ${pounds(Number(ch.amount_refunded))} but their survey shows ${pounds(rec.refunded)} refunded. Record the refund on their card.`]);
  if (ch.disputed) out.push(['dispute', `${who(j)}'s bank has disputed their ${pounds(amount)} card payment. Answer it in Stripe before the deadline.`]);
  return out;
}

export async function stripeCheck({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (!stripeOn()) return { skipped: 'no key' };
  const since = Math.floor((now - 7 * DAY) / 1000);
  const pis = (await list(`/payment_intents?limit=100&created[gte]=${since}&expand[]=data.latest_charge`, fetchImpl)).filter((p) => p.status === 'succeeded');
  const found = new Map();
  for (const pi of pis) {
    const jobId = Number((pi.metadata || {}).job_id) || null;
    const j = jobId ? await queryOne(`select id, site, customer_name, customer_postcode from jobs where id = $1 and site in ('dampscan', 'ati-london')`, [jobId]) : null;
    /* A payment for another business on the same Stripe account is not ours to judge. */
    if (jobId && !j) continue;
    const rec = j ? await recorded(pi.id, j.id) : null;
    for (const [kind, say] of problemsOf(pi, j, rec, now)) found.set(`${kind}:${pi.id}`, { kind, say, job: j });
  }
  /* New problems: one to-do each. */
  let raised = 0;
  for (const [key, p] of found) {
    const open = await queryOne('select key from stripe_issues where key = $1 and cleared_at is null', [key]);
    if (open) continue;
    const t = await queryOne(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Card check', 'manual', true) returning id`,
      [p.job ? p.job.site : 'ati-london', p.job ? p.job.id : null, p.say]);
    await query(`insert into stripe_issues (key, kind, job_id, site, say, todo_id) values ($1, $2, $3, $4, $5, $6)
        on conflict (key) do update set say = excluded.say, todo_id = excluded.todo_id, found_at = now(), cleared_at = null`,
      [key, p.kind, p.job ? p.job.id : null, p.job ? p.job.site : null, p.say, t.id]);
    raised += 1;
  }
  /* Problems from the last week that line up now: cleared, and their to-do closed saying so. */
  const gone = (await query(`select key, todo_id from stripe_issues where cleared_at is null`)).filter((r) => !found.has(r.key) && pis.some((pi) => r.key.endsWith(':' + pi.id)));
  for (const g of gone) {
    await query('update stripe_issues set cleared_at = now() where key = $1', [g.key]);
    if (g.todo_id) await query('update todos set done_at = now() where id = $1 and done_at is null', [g.todo_id]);
  }
  const open = Number((await queryOne('select count(*)::int as n from stripe_issues where cleared_at is null')).n);
  const said = open ? `${open} card payment${open === 1 ? '' : 's'} not lining up with ${open === 1 ? 'its survey' : 'their surveys'}.` : `All ${pis.length} card payment${pis.length === 1 ? '' : 's'} of the last week match their surveys.`;
  await query(`insert into check_runs (name, at, ok, said, facts) values ('card_check', now(), $1, $2, $3::jsonb)
      on conflict (name) do update set at = now(), ok = excluded.ok, said = excluded.said, facts = excluded.facts`, [!open, said, JSON.stringify({ payments: pis.length, open, raised })]);
  return { payments: pis.length, raised, cleared: gone.length, open };
}
