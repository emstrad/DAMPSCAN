/**
 * Booking again from a cancelled survey's page (the owner, 22 Nov 2026): only
 * a time really free, never who; a request with a to-do the hourly sweep keeps
 * until they are booked again, Needs you now and What's next showing it, and
 * the survey left cancelled until the team brings it back.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'rebook-secret-long-enough-xxxxxxxxxxxx';
process.env.IP_SALT = 'rebook-salt-long-enough-for-the-check-xxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const DAY = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const FREE = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
mock.module('../lib/web-booking.js', { namedExports: { dayTimes: async () => [{ date: FREE, times: [{ time: '10:00', surveyor: 'ben' }, { time: '14:00', surveyor: 'ronnie' }] }] } });

const R = await import('../lib/portal-rebook.js');
const { pageAsks } = await import('../lib/page-asks.js');
const { doneBecause } = await import('../lib/todo-sweep.js');
const { jobRow } = await import('../lib/next-up.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, notifications, portal_events, lab_flags restart identity cascade'); });
after(async () => { await pool.end(); });

const req = { headers: { 'user-agent': 'iPhone' }, socket: { remoteAddress: '1.2.3.4' } };
async function job(status = 'cancelled') {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_price_pence, date_set, job_date, job_time, surveyor, survey_type, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', $2, 'Richard Lee', 'ME19 6AB', 29500, true, $1, '09:00', 'ben', 'localised', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY, status])).rows[0].id);
}
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, 0 as paid_pence, 0 as refunded_pence, '{}'::text[] as lead_files from jobs j where id = $1`, [id])).rows[0];

test('a cancelled survey can ask to book again: free times only, never who, a request with a to-do', async () => {
  const booked = await job('booked');
  assert.equal(R.canRebook(await row(booked)), false, 'only once cancelled');
  assert.deepEqual(await R.rebookTimes(await row(booked)), { error: 'not_now' });
  const id = await job();
  assert.equal(R.canRebook(await row(id)), true);
  await pool.query("insert into lab_flags (key, enabled) values ('instant_booking', false) on conflict (key) do update set enabled = false");
  const seen = await R.pageTimes(await row(id));
  assert.deepEqual(seen.days, [{ date: FREE, times: ['10:00', '14:00'] }], 'never who');
  assert.equal(seen.self, false, 'switch off: a request');
  assert.equal(seen.survey.price, '£295');
  assert.deepEqual(await R.askRebook(req, await row(id), { date: FREE, time: '11:00' }), { error: 'taken' });
  assert.equal((await R.askRebook(req, await row(id), { date: FREE, time: '14:00' })).ok, true);
  const j = await row(id);
  assert.equal(j.status, 'cancelled', 'nothing booked by the page');
  assert.deepEqual(R.rebookAsked(j), { date: FREE, time: '14:00' });
  const todo = (await pool.query('select * from todos')).rows[0];
  assert.match(todo.text, /^Richard \(ME19\) asked to book again for .* at 14:00\. Call them/);
  assert.equal(doneBecause(todo, j, null, false), null, 'the sweep keeps it while they are still cancelled');
  assert.match((await pool.query("select title from notifications where kind = 'portal_move'")).rows[0].title, /Wants to book again/);
  /* Needs you now and What's next both show it, as booking again. */
  const asks = await pageAsks(['dampscan']);
  assert.equal(asks[0].ask.what, 'rebook');
  assert.match(jobRow({ ...j, job_date: j.job_day }).next, /^Book them again for /);
  /* Brought back and booked: the ask and its to-do are done. */
  await pool.query("update jobs set status = 'booked' where id = $1", [id]);
  assert.equal(R.rebookAsked(await row(id)), null);
  assert.equal(doneBecause(todo, await row(id), null, false), 'booked again or no longer asked');
});

test('a cancelled survey with nothing asked stays off What\'s next', async () => {
  const id = await job();
  const j = await row(id);
  assert.equal(jobRow({ ...j, job_date: j.job_day }), null);
});
