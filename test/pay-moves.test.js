/**
 * Who gets what on one survey (the owner, 17 Nov 2026), on Isabella's real
 * figures: £715, Tom surveying for £190, Scott and Tom both went, so £100 of
 * Ben's share goes to Scott: Ben £48.10, Scott £185.80. Everywhere reads it.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const M = await import('../lib/pay-moves.js');
const B = await import('../lib/pay-book.js');
const { jobTotals } = await import('../lib/job-totals.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, job_pay_moves restart identity cascade'); });
after(async () => { await pool.end(); });

const survey = async () => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, paid_at,
    tax_bp, lead_bp, lead_earner, partner_a, partner_b, pay_scott_pence, pay_tom_pence, pay_ben_pence)
  values ('ati-london', 'paid', 'Isabella Glendinning', 'N7 0JE', 'premium', 71500, 'tom', 19000, true, current_date - 1, '09:00', now(), 2000, 1500, 'scott', 'tom', 'ben', 8580, 33810, 14810) returning id`)).rows[0].id);
const now = (s, k) => (s.people.find((p) => p.key === k) || { now: 0 }).now;

test('£100 of Ben\'s share moves to Scott on this survey alone, and the total never changes', async () => {
  const id = await survey();
  const before = await M.jobSplit(id);
  assert.deepEqual(['scott', 'tom', 'ben'].map((k) => now(before, k)), [8580, 33810, 14810]);
  const out = await M.addMove({ jobId: id, from: 'ben', to: 'scott', pence: 10000, reason: 'Scott and Tom both went' }, 'Scott');
  assert.ok(!out.error, out.error);
  assert.equal(now(out.split, 'ben'), 4810, 'Ben £48.10');
  assert.equal(now(out.split, 'scott'), 18580, 'Scott £185.80');
  const total = (s) => s.people.reduce((t, p) => t + p.now, 0);
  assert.equal(total(out.split), total(before));
  const log = (await pool.query('select sched_log from jobs where id = $1', [id])).rows[0].sched_log;
  assert.match(log.at(-1).note, /£100 moved from Ben to Scott \(Scott and Tom both went\)/);

  /* Pay, Overview, Money and Week all read the pay book; Money and rates its own totals. */
  const row = (await B.surveysDone(await B.splitSettings())).find((r) => r.id === id);
  assert.equal(row.share.ben, 4810); assert.equal(row.share.scott, 18580); assert.equal(row.moved, 1);
  const t = await jobTotals(['ati-london'], `'2000-01-01'::date`);
  assert.equal(t.pay.ben, 4810); assert.equal(t.pay.scott, 18580);
});

test('a move is refused past what someone has, between one person, or without a reason; taking back is guarded', async () => {
  const id = await survey();
  assert.match((await M.addMove({ jobId: id, from: 'ben', to: 'scott', pence: 20000, reason: 'x' }, 'Scott')).error, /Ben has £148\.10/);
  assert.ok((await M.addMove({ jobId: id, from: 'ben', to: 'ben', pence: 100, reason: 'x' }, 'Scott')).error);
  assert.ok((await M.addMove({ jobId: id, from: 'ben', to: 'tom', pence: 100, reason: ' ' }, 'Scott')).error);
  const first = await M.addMove({ jobId: id, from: 'ben', to: 'scott', pence: 10000, reason: 'Both went' }, 'Scott');
  await M.addMove({ jobId: id, from: 'scott', to: 'ronnie', pence: 18000, reason: 'Ronnie wrote it up' }, 'Scott');
  assert.match((await M.removeMove(first.id, 'Scott')).error, /take back the later move first/, 'Scott passed it on to Ronnie');
  const moves = (await M.jobSplit(id)).moves;
  const back = await M.removeMove(moves[1].id, 'Tom');
  assert.ok(!back.error);
  assert.equal(now(back.split, 'ronnie'), 0);
  assert.ok(!(await M.removeMove(first.id, 'Tom')).error);
  assert.equal(now((await M.jobSplit(id)), 'ben'), 14810, 'back as the waterfall had it');
  assert.equal((await pool.query('select count(*)::int as n from job_pay_moves where removed_at is not null and removed_by = $1', ['Tom'])).rows[0].n, 2, 'kept, with who took it back');
});
