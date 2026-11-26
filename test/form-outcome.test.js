/**
 * How far the booking form got, told to the team at once (the owner, 26 Nov
 * 2026): "Call me to arrange" and the times seen but none picked each make
 * one alert and a history line, once per enquiry; a time picked says nothing
 * more here (it has its own alert), and a fresh visitor is left alone.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const O = await import('../lib/form-outcome.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

const SESSION = '0b6a1f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
async function lead(session = SESSION) {
  return Number((await pool.query(`insert into leads (site, stage, first_name, email, phone, postcode, session_id, survey_choice)
    values ('ati-london', 'complete', 'Larry', 'l@example.com', '07850666000', 'CR0 6EY', $1, $2) returning id`,
  [session, JSON.stringify({ name: 'Full house damp survey', price: 295, key: 'full-house' })])).rows[0].id);
}
const alerts = async () => (await pool.query(`select title, message from notifications order by id`)).rows;
const log = async (id) => (await pool.query('select sched_log from leads where id = $1', [id])).rows[0].sched_log || [];

test('Call me to arrange: one alert with what they chose and a line in their history, once', async () => {
  const id = await lead();
  assert.equal((await O.recordOutcome(id, 'call', { sessionId: '11111111-1111-4111-8111-111111111111' })).ok, false, 'only from their own browser');
  await O.recordOutcome(id, 'call', { sessionId: SESSION });
  await O.recordOutcome(id, 'call', { sessionId: SESSION });
  const a = await alerts();
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Wants a call/);
  assert.match(a[0].message, /Larry.*CR0.*Full house damp survey \(£295\)/);
  assert.match((await log(id)).at(-1).note, /Asked us to call/);
});

test('the times seen and none picked: told after ten minutes, not before, and not once a time is picked', async () => {
  const id = await lead(), picked = await lead('22222222-2222-4222-8222-222222222222');
  await O.reachedTimes(id); await O.reachedTimes(picked);
  assert.equal(await O.sweepLeft(), 0, 'still choosing');
  await pool.query(`update leads set form_step_at = now() - interval '11 minutes'`);
  await O.recordOutcome(picked, 'picked');
  assert.equal(await O.sweepLeft(), 1);
  const a = await alerts();
  assert.equal(a.length, 1);
  assert.match(a[0].title, /Did not pick a time/);
  assert.match((await log(id)).at(-1).note, /did not pick one/);
  assert.equal(await O.sweepLeft(), 0, 'once');
});
