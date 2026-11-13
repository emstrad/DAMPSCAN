/**
 * Moving the survey from their own page (the owner's choice, 13 Nov 2026):
 * with Book it straight away on, their own surveyor's real free times, moved
 * there and then with the "as you asked" text at once; twice, then a request.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'move-secret-long-enough-xxxxxxxxxxxxxx', IP_SALT: 'move-salt', SMS_QUIET_HOURS: 'off', SMS_AUTO: 'on',
  TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_DAMPSCAN: 'DampScan' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

let texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (String(url).includes('api.twilio.com')) { texts.push(new URLSearchParams(o.body).get('Body')); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) }; }
  throw new Error('unexpected call ' + url);
};

const { moveNow, movesItself } = await import('../lib/portal-move.js');
const H = await import('../lib/hours-store.js');
const { flushDue } = await import('../lib/texts.js');

const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const req = { headers: {}, socket: {} };
before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('ME142RP', 51.2803, 0.5313) on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, portal_events, lab_flags, surveyor_hours, surveyor_usual, surveyor_day_set restart identity cascade');
  texts = [];
  await H.setUsual('ben', [0, 1, 2, 3, 4, 5, 6], [{ start: '09:00', end: '17:00' }]);
});
after(async () => { await pool.query('truncate surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags'); await pool.end(); globalThis.fetch = realFetch; });

async function book() {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME14 2RP', '07700 900123', 'localised', 21500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [day(6)])).rows[0].id);
  /* Booked through the app, so its surveyor was told and its booked text went. */
  await pool.query("update jobs set surveyor_told = 'ben|' || job_date::text || '|09:00' where id = $1", [id]);
  await pool.query("insert into sms_outbox (site, job_id, kind, dedupe, status, sent_at, payload) values ('dampscan', $1, 'booked', 'b', 'sent', now(), $2)", [id, JSON.stringify({ when: `${day(6)} 09:00` })]);
  return id;
}
const load = async (id) => (await pool.query('select j.*, j.job_date::text as job_day from jobs j where j.id = $1', [id])).rows[0];

test('they move it themselves: their surveyor, there and then, "as you asked" at once; a request once switched off', async () => {
  const id = await book();
  assert.equal(await movesItself(await load(id)), false, 'switch off: still a request');
  await pool.query("insert into lab_flags (key, enabled) values ('instant_booking', true)");
  assert.equal(await movesItself(await load(id)), true);
  const out = await moveNow(req, await load(id), { date: day(7), time: '13:00' });
  assert.deepEqual(out, { ok: true, moved: { date: day(7), time: '13:00' } });
  const j = await load(id);
  assert.deepEqual([j.job_day, String(j.job_time).slice(0, 5), j.surveyor], [day(7), '13:00', 'ben']);
  await flushDue();
  assert.match(texts.at(-1), /^Hi Kim, all done! As you asked, your DampScan survey is now .+, arriving 1 to 2pm\./);
  assert.match((await moveNow(req, await load(id), { date: day(7), time: '23:00' })).error, /taken/, 'only a time really offered');
  await moveNow(req, await load(id), { date: day(8), time: '10:00' });
  assert.equal(await movesItself(await load(id)), false, 'twice, then it is a request again');
});
