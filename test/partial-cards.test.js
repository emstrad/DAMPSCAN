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

test('the same person already on the board is merged in, never a second card, even on half the details', async () => {
  const s = '11111111-1111-1111-1111-111111111111';
  const annDraft = await partial('Ann', 'ann@example.com', 45, { session: s });
  const ann = Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('dampscan', 'complete', 'Ann', 'ME19 4AA', 'ann@example.com', $1) returning id`, [s])).rows[0].id);
  /* Half the details: a different email, the same first name and postcode, and a phone the card lacked. */
  const cara = Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('dampscan', 'complete', 'Cara Lee', 'ME19 4AA', 'cara@example.com', gen_random_uuid()) returning id`)).rows[0].id);
  const caraDraft = await partial('cara', 'cara.lee@work.example', 45, { phone: '07700 900222' });
  await partial('Ben', 'ben@example.com', 45, { phone: '07700 900111' });
  await pool.query(`insert into jobs (site, customer_name, customer_phone, status, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('dampscan', 'Ben', '+447700900111', 'booked', 0, 0, '', '', '')`);
  assert.equal(await cardPartials(), 0, 'no new cards');
  const row = async (id) => (await pool.query('select * from leads where id = $1', [id])).rows[0];
  assert.equal(Number((await row(annDraft)).merged_into), ann);
  const c = await row(cara);
  assert.equal(c.phone, '07700 900222', 'the missing phone is filled in');
  assert.ok(c.sched_log.some((e) => /did not finish/.test(e.note)), 'and the history says so');
  assert.ok((await row(caraDraft)).closed_at);
  const job = (await pool.query('select sched_log from jobs')).rows[0];
  assert.ok(job.sched_log.some((e) => /did not finish/.test(e.note)), 'a booked customer gets the note on their job');
});

test('a second website form on half the same details folds the first in and keeps its details', async () => {
  const { mergeDuplicates } = await import('../lib/merge-dupes.js');
  const first = Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, address_line1, session_id) values ('dampscan', 'complete', 'Kim', 'ME19 4AA', 'kim@home.example', '1 Mill Lane', gen_random_uuid()) returning id`)).rows[0].id);
  const second = Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, phone, session_id) values ('dampscan', 'complete', 'Kim Patel', 'ME194AA', 'kim@work.example', '07700 900444', gen_random_uuid()) returning id`)).rows[0].id);
  assert.equal(await mergeDuplicates(second), 1);
  const [a, b] = (await pool.query('select * from leads where id = any($1::bigint[]) order by id', [[first, second]])).rows;
  assert.equal(Number(a.merged_into), second);
  assert.equal(b.address_line1, '1 Mill Lane', 'the address only the first form had is kept');
});
