/**
 * The growth plan (the owner, 20 Nov 2026): phases and their targets, surveys
 * a week, each surveyor's load against ten, and the hire signal.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const G = await import('../lib/growth-plan.js');
const O = await import('../lib/company-overview.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs restart identity cascade'); });
after(async () => { await pool.end(); });

test('weeks start on Monday; the phase follows the date; hiring waits for four busy weeks in a row', () => {
  assert.equal(G.mondayOf('2026-11-20'), '2026-11-16');
  assert.equal(G.mondayOf('2026-11-16'), '2026-11-16');
  assert.equal(G.mondayOf('2026-11-22'), '2026-11-16');
  assert.equal(G.phaseOf('2026-11-20').n, 1);
  assert.equal(G.phaseOf('2027-06-01').n, 2);
  assert.equal(G.phaseOf('2031-01-01').n, 4, 'past the plan it stays on the last phase');
  assert.equal(G.hireSignal([{ name: 'Tom', weeks: [3, 9, 9, 9, 9] }]).now, true);
  assert.equal(G.hireSignal([{ name: 'Tom', weeks: [9, 9, 8, 9, 9] }]).now, false, 'eight is not over eight');
  assert.equal(G.hireSignal([{ name: 'Tom', weeks: [9, 9, 9] }]).now, false, 'needs four weeks');
});

test('Tom over eight a week for four weeks: the plan says hire, and Overview asks for it', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const mon = G.mondayOf(today);
  for (let w = 1; w <= 4; w += 1) {
    for (let i = 0; i < 9; i += 1) {
      await pool.query(`insert into jobs (site, status, customer_name, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
        values ('ati-london', 'completed', 'Kim', 'full-house', 29500, 'tom', 13000, true, $1::date - $2::int, '10:00', 2000, 0, 'scott', 'tom', 'ben')`, [mon, w * 7 - (i % 5)]);
    }
  }
  await pool.query(`insert into jobs (site, status, customer_name, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', 'cancelled', 'Gone', 'full-house', 29500, 'tom', 13000, true, $1::date - 3, '10:00', 2000, 0, 'scott', 'tom', 'ben')`, [mon]);
  const p = await G.growthPlan({ today });
  const tom = p.loads.find((l) => l.key === 'tom');
  assert.deepEqual(tom.weeks.slice(-4), [9, 9, 9, 9], 'a cancelled survey never counts');
  assert.equal(tom.avg, 9);
  assert.equal(p.avg, 9);
  assert.equal(p.hire.now, true);
  assert.deepEqual(p.hire.who, ['Tom']);
  assert.equal(p.capacity, 10);
  assert.equal(p.onTrack, 9 >= p.phase.target);
  const o = await O.overview();
  assert.ok(o.attention.some((a) => /^Time to hire a surveyor: Tom over 8 a week for four weeks$/.test(a.text) && a.tab === 'growth'), o.attention.map((a) => a.text).join(' | '));
});
