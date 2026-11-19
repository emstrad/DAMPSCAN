/**
 * The hourly card check (lib/stripe-check.js), the last 24 hours
 * (lib/overnight.js) and the sweep's tools (lib/mcp/sweep-tools.js), with a
 * pretend Stripe: a payment on its survey passes; one Stripe took that no
 * survey shows makes one owners' to-do, which closes itself once recorded; a
 * dispute and a refund not on the survey are caught; nothing is raised twice.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { stripeCheck, problemsOf } = await import('../lib/stripe-check.js');
const { overnight } = await import('../lib/overnight.js');
const { TOOLS } = await import('../lib/mcp/tools.js');
const run = (name, scope, args = {}) => TOOLS.find((t) => t.name === name).run(scope, args);
const OWNERS = { isAdmin: true, name: 'Owners', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } };

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); process.env.STRIPE_SECRET_KEY = 'sk_test_x'; });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, stripe_issues, check_runs, pay_orders, mail_items restart identity cascade'); });
after(async () => { delete process.env.STRIPE_SECRET_KEY; await pool.end(); });

const NOW = Date.parse('2026-11-19T12:00:00Z');
const ago = (h) => Math.floor((NOW - h * 3600000) / 1000);
async function job(name, postcode) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date)
    values ('ati-london', 'booked', $1, $2, 'full-house', 29500, 'tom', 0, 0, '', '', '', true, '2026-11-25') returning id`, [name, postcode])).rows[0].id);
}
const pi = (id, jobId, pence, o = {}) => ({ id, status: 'succeeded', amount: pence, amount_received: pence, created: ago(o.hours || 5), metadata: jobId ? { job_id: String(jobId) } : {},
  latest_charge: { amount_refunded: o.refunded || 0, disputed: Boolean(o.disputed) } });
const stripe = (list) => async () => ({ ok: true, json: async () => ({ data: list, has_more: false }) });

test('a recorded payment passes; one Stripe took that no survey shows is one to-do, closed once recorded', async () => {
  const kim = await job('Kim Lee', 'SE4 1PE');
  const raj = await job('Raj Patel', 'SE9 1AA');
  await pool.query(`insert into job_payments (job_id, amount_pence, label, paid_on, external_ref) values ($1, 14750, 'deposit', current_date, 'stripe:pi_kim')`, [kim]);
  const list = [pi('pi_kim', kim, 14750), pi('pi_raj', raj, 14750)];
  let out = await stripeCheck({ fetchImpl: stripe(list), now: NOW });
  assert.deepEqual([out.payments, out.raised, out.open], [2, 1, 1]);
  const [t] = (await pool.query(`select text, set_by_name, job_id from todos`)).rows;
  assert.equal(t.set_by_name, 'Card check');
  assert.match(t.text, /^Raj \(SE9\) paid £147\.50 by card but their survey does not show it/);
  out = await stripeCheck({ fetchImpl: stripe(list), now: NOW });
  assert.equal(out.raised, 0, 'never twice');

  await pool.query(`insert into job_payments (job_id, amount_pence, label, paid_on, external_ref) values ($1, 14750, 'deposit', current_date, 'stripe:pi_raj')`, [raj]);
  out = await stripeCheck({ fetchImpl: stripe(list), now: NOW });
  assert.deepEqual([out.cleared, out.open], [1, 0]);
  assert.ok((await pool.query('select done_at from todos')).rows[0].done_at, 'its to-do closed itself');
  const [c] = (await pool.query(`select ok, said from check_runs where name = 'card_check'`)).rows;
  assert.deepEqual([c.ok, c.said], [true, 'All 2 card payments of the last week match their surveys.']);
});

test('a dispute, a refund not on the survey, a different amount and a payment on no survey are each caught; a fresh one waits', () => {
  const j = { id: 1, customer_name: 'Kim Lee', customer_postcode: 'SE4 1PE' };
  const kinds = (p, rec) => problemsOf(p, j, rec, NOW).map((x) => x[0]);
  assert.deepEqual(kinds(pi('a', 1, 14750, { disputed: true }), { paid: 14750, refunded: 0 }), ['dispute']);
  assert.deepEqual(kinds(pi('b', 1, 14750, { refunded: 14750 }), { paid: 14750, refunded: 0 }), ['refund']);
  assert.deepEqual(kinds(pi('c', 1, 14750), { paid: 10000, refunded: 0 }), ['amount']);
  assert.deepEqual(kinds({ ...pi('d', 1, 14750), created: Math.floor(NOW / 1000) - 60 }, { paid: 0, refunded: 0 }), [], 'half an hour to land first');
  assert.equal(problemsOf(pi('e', null, 5000), null, null, NOW)[0][0], 'no_survey');
});

test('the last 24 hours counts what happened and every check; the sweep reports in; the brief reads the same figures', async () => {
  await pool.query(`insert into leads (site, stage, first_name, email, postcode, session_id, source_path) values ('ati-london', 'complete', 'Michael', 'm@x.com', 'SE9 1AA', gen_random_uuid(), 'email'),
    ('dampscan', 'complete', 'Mark', 'mk@x.com', 'ME19 4DP', gen_random_uuid(), '/')`);
  const kim = await job('Kim Lee', 'SE4 1PE');
  await pool.query(`insert into job_payments (job_id, amount_pence, label, paid_on) values ($1, 14750, 'deposit', current_date)`, [kim]);
  const o = await overnight(['dampscan', 'ati-london']);
  assert.equal(o.lines.find((l) => l.key === 'enquiries').said, '2 new enquiries: 1 website, 1 email');
  assert.equal(o.lines.find((l) => l.key === 'paid').said, '£147.50 paid in (1 payment)');
  assert.equal(o.checks.find((c) => c.name === 'Inbox sweep').state, 'off');

  const done = (await run('sweep_done', OWNERS, { emails_read: 12, emails_filed: 4, cards_added: 1, needs_you: 2 })).data;
  assert.match(done.said, /12 emails read, 4 filed, 1 new card, 2 for you/);
  const after = await overnight(['dampscan', 'ati-london']);
  assert.deepEqual([after.checks.find((c) => c.name === 'Inbox sweep').state, after.allOk], ['ok', false], 'the hourly run has not been seen, so not all sweet');

  const brief = (await run('morning_brief', OWNERS)).data;
  assert.ok(brief.ok);
  assert.deepEqual(brief.last24.lines.map((l) => l.said), after.lines.map((l) => l.said), 'the page and the app read the same figures');
  assert.ok(brief.surveys.every((s) => !/Lee/.test(s.who)), 'first name only');
  assert.equal((await run('morning_brief', { isAdmin: false, businesses: ['dampscan'], levels: { dampscan: 'work' } })).data.ok, false);
});
