/**
 * The Company pages for ChatGPT and Claude (the owner, 20 Nov 2026: a board
 * project that sees everything): the same figures as the pages, owners only.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { TOOLS } = await import('../lib/mcp/tools.js');
const M = await import('../lib/company-money.js');
const run = (name, scope, args) => TOOLS.find((t) => t.name === name).run(scope, args);
const BOSS = { isAdmin: true, name: 'Owners', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } };
const TOM_ATI = { isAdmin: false, personId: 3, name: 'Tom', businesses: ['ati-london'], levels: { 'ati-london': 'manage' } };
const BEN = { isAdmin: false, personId: 9, name: 'Ben', businesses: ['dampscan'], levels: { dampscan: 'work' } };
const NAMES = ['company_overview', 'company_money', 'pay_book', 'paying_yourselves', 'accountant_view', 'growth_view', 'company_week'];

let saved;
before(async () => { saved = (await pool.query('select tax_bp, lead_bp, shares from job_settings')).rows[0]; await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
after(async () => { await pool.query('update job_settings set tax_bp = $1, lead_bp = $2, shares = $3::jsonb', [saved.tax_bp, saved.lead_bp, saved.shares ? JSON.stringify(saved.shares) : null]); await pool.end(); });

test('every Company tool is read only, listed in the guide, and refused to all but the owners', async () => {
  const guide = (await readFile(new URL('../lib/mcp/guide-tools.js', import.meta.url), 'utf8'));
  for (const n of NAMES) {
    const t = TOOLS.find((x) => x.name === n);
    assert.ok(t, n);
    assert.equal(t.annotations.readOnlyHint, true, n);
    assert.ok(guide.includes(n), `${n} in the guide`);
    for (const who of [TOM_ATI, BEN]) assert.equal((await run(n, who, {})).status, 400, `${n} refused to ${who.name}`);
  }
});

test('the owners read the same figures as the pages', async () => {
  await pool.query('truncate jobs, paid_out, expenses restart identity cascade');
  await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, paid_at, deposit_paid_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b, shares)
    values ('dampscan', 'completed', 'Kim Lee', 'ME19 6AB', 'full-house', 29500, 'ronnie', 13000, true, current_date - 1, '10:00', now(), now(), 2000, 0, 'scott', 'tom', 'ben', '{"scott":4000,"tom":4000,"ben":2000}')`);
  const money = (await run('company_money', BOSS, { period: 'year' })).data;
  assert.equal(money.ok, true);
  const page = await M.moneyView({ from: money.from, withCards: false });
  assert.equal(money.period.in, page.period.in);
  assert.equal(money.period.in, 29500);
  assert.match(money.tip, /pence/);
  const pay = (await run('pay_book', BOSS, {})).data;
  assert.equal(pay.cards.find((c) => c.key === 'ronnie').owed, 13000);
  const ronnie = (await run('pay_book', BOSS, { who: 'ronnie' })).data;
  assert.equal(ronnie.owed, 13000);
  for (const n of ['company_overview', 'paying_yourselves', 'accountant_view', 'growth_view', 'company_week']) assert.equal((await run(n, BOSS, {})).data.ok, true, n);
});

test('who gets what on a survey: owners move pay through the same path as the pop-up, and take it back', async () => {
  const id = Number((await pool.query('select id from jobs order by id limit 1')).rows[0].id);
  assert.equal((await run('move_pay', TOM_ATI, { id, from: 'ronnie', to: 'ben', amount_pounds: 65, reason: 'Together' })).status, 400, 'not for a single-brand manager');
  const before = (await run('survey_split', BOSS, { id })).data;
  const ron = before.people.find((p) => p.key === 'ronnie').now;
  const moved = (await run('move_pay', BOSS, { id, from: 'ronnie', to: 'ben', amount_pounds: 65, reason: 'Ronnie and Ben surveyed together' })).data;
  assert.equal(moved.ok, true);
  assert.equal(moved.split.people.find((p) => p.key === 'ronnie').now, ron - 6500);
  assert.equal((await run('move_pay', BOSS, { id, from: 'ronnie', to: 'ben', amount_pounds: 9999, reason: 'x' })).status, 400, 'never more than they have');
  const back = (await run('undo_pay_move', BOSS, { move_id: moved.id })).data;
  assert.equal(back.split.people.find((p) => p.key === 'ronnie').now, ron);
});
