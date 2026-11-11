/**
 * What a customer asks from their page (the owners' plan, 11 Nov 2026):
 * Message us lands on the card's history with an alert, a few a day; Ask to
 * move takes only a time really free and is a request, never a change;
 * photos only from our own upload route; On my way shows two minutes after
 * the tap.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'asks-secret-long-enough-xxxxxxxxxxxxxx';
process.env.IP_SALT = 'asks-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const DAY = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const FREE = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
mock.module('../lib/web-booking.js', { namedExports: { dayTimes: async () => [{ date: FREE, times: [{ time: '10:00', surveyor: 'ben' }, { time: '14:00', surveyor: 'ronnie' }] }] } });

const A = await import('../lib/portal-asks.js');
const { buildView } = await import('../lib/portal-view.js');
const { allowedWrite } = await import('../lib/work-only.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, notifications, portal_events restart identity cascade'); });
after(async () => { await pool.end(); });

const req = { headers: { 'user-agent': 'iPhone' }, socket: { remoteAddress: '1.2.3.4' } };
async function job() {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_price_pence, date_set, job_date, job_time, surveyor, survey_type, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', 29500, true, $1, '09:00', 'ben', 'localised', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY])).rows[0].id);
}
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, 0 as paid_pence, 0 as refunded_pence, '{}'::text[] as lead_files from jobs j where id = $1`, [id])).rows[0];

test('a message goes on their history with an alert, never quoted in the alert, five a day at most', async () => {
  const id = await job();
  assert.deepEqual(await A.messageUs(req, await row(id), 'Can you call after 5pm?'), { ok: true });
  const log = (await pool.query('select sched_log from jobs where id = $1', [id])).rows[0].sched_log;
  assert.equal(log[0].note, 'They wrote on their page: Can you call after 5pm?');
  const n = (await pool.query("select message from notifications where kind = 'portal_message'")).rows[0];
  assert.ok(!/5pm/.test(n.message), 'the words stay on the card');
  for (let i = 0; i < 4; i += 1) await A.messageUs(req, await row(id), 'again');
  assert.deepEqual(await A.messageUs(req, await row(id), 'one too many'), { error: 'too_many' });
  assert.deepEqual(await A.messageUs(req, await row(id), ' '), { error: 'empty' });
});

test('ask to move: only a time offered, a request with a to-do, the survey unchanged; never who', async () => {
  const id = await job();
  const offered = await A.moveTimes(await row(id));
  assert.deepEqual(offered, { days: [{ date: FREE, times: ['10:00', '14:00'] }] }, 'no surveyor in what the page sees');
  assert.deepEqual(await A.askToMove(req, await row(id), { date: FREE, time: '11:00' }), { error: 'taken' });
  assert.equal((await A.askToMove(req, await row(id), { date: FREE, time: '14:00' })).ok, true);
  const j = await row(id);
  assert.equal(j.job_day, DAY, 'still booked where it was');
  assert.deepEqual(A.moveAsked(j), { date: FREE, time: '14:00' });
  assert.match((await pool.query('select text from todos')).rows[0].text, /^Kim \(ME19\) asked to move their survey to .* at 14:00\. Move it on their job card/);
  await pool.query(`update jobs set job_date = $2 where id = $1`, [id, FREE]);
  assert.equal(A.moveAsked(await row(id)), null, 'once moved, the ask is done');
  await pool.query(`update jobs set job_date = (now() at time zone 'Europe/London')::date where id = $1`, [id]);
  assert.equal(A.canMove(await row(id)), false, 'not on the day itself');
});

test('photos only from our own upload route, added to the job when there is no enquiry', async () => {
  const id = await job();
  const ok = 'leads/2026-11-11/0b6a1f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b-damp.jpg';
  assert.deepEqual(await A.addPhotos(req, await row(id), ['reports/other.pdf', '../x.jpg', 'leads/2026-11-11/not-a-uuid-x.jpg']), { error: 'no_photos' });
  assert.deepEqual(await A.addPhotos(req, await row(id), [ok]), { ok: true, added: 1 });
  assert.deepEqual((await pool.query('select customer_files from jobs where id = $1', [id])).rows[0].customer_files, [ok]);
});

test('On my way shows two minutes after the tap, on the day, and surveyors may tap it', async () => {
  const id = await job();
  await pool.query(`update jobs set job_date = (now() at time zone 'Europe/London')::date, on_way_at = now() + interval '2 minutes' where id = $1`, [id]);
  assert.equal(buildView(await row(id)).onWay, null, 'not yet: the undo window');
  await pool.query(`update jobs set on_way_at = now() - interval '1 minute' where id = $1`, [id]);
  assert.deepEqual(buildView(await row(id)).onWay, { surveyor: 'Ben' });
  assert.equal(allowedWrite('surveys', 'POST', { op: 'onway', id }), true);
  assert.equal(allowedWrite('surveys', 'POST', { op: 'refund', id, pence: 100 }), false);
});
