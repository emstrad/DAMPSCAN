/**
 * A half-finished ATi or DampScan form becomes a Scheduling card by itself
 * after half an hour, unless the same person finished or was booked.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const { cardPartials } = await import('../lib/partial-cards.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, jobs, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

const partial = async (name, email, mins, extra = {}) => Number((await pool.query(
  `insert into leads (site, stage, first_name, postcode, email, phone, session_id, created_at) values ($1, 'partial', $2, 'ME19 4AA', $3, $4, coalesce($5::uuid, gen_random_uuid()), now() - make_interval(mins => $6)) returning id`,
  [extra.site || 'dampscan', name, email, extra.phone || null, extra.session || null, mins])).rows[0].id);

test('a form left half done for half an hour becomes a card in New, flagged, with one alert', async () => {
  const kim = await partial('Kim', 'kim@example.com', 45);
  const fresh = await partial('Fay', 'fay@example.com', 5);
  const roof = await partial('Rob', 'rob@example.com', 45, { site: 'roofing' });
  assert.equal(await cardPartials(), 1);
  const rows = (await pool.query('select id, stage, sched_stage, from_partial from leads order by id')).rows;
  assert.deepEqual(rows.find((r) => Number(r.id) === kim), { id: rows.find((r) => Number(r.id) === kim).id, stage: 'complete', sched_stage: 'new', from_partial: true });
  assert.equal(rows.find((r) => Number(r.id) === fresh).stage, 'partial', 'still filling it in');
  assert.equal(rows.find((r) => Number(r.id) === roof).stage, 'partial', 'damp only');
  assert.equal((await pool.query(`select count(*)::int as n from notifications where kind = 'lead_partial'`)).rows[0].n, 1);
  assert.equal(await cardPartials(), 0, 'once');
});

test('not when the same person finished the form or is already booked', async () => {
  const s = '11111111-1111-1111-1111-111111111111';
  await partial('Ann', 'ann@example.com', 45, { session: s });
  await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('dampscan', 'complete', 'Ann', 'ME19 4AA', 'ann@example.com', $1)`, [s]);
  await partial('Ben', 'ben@example.com', 45, { phone: '07700 900111' });
  await pool.query(`insert into jobs (site, customer_name, customer_phone, status, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('dampscan', 'Ben', '+447700900111', 'booked', 0, 0, '', '', '')`);
  assert.equal(await cardPartials(), 0);
});
