/**
 * Booked again there and then from a cancelled survey's page (the owner,
 * 22 Nov 2026: "instant booking but confirmation of same survey"): the same
 * survey and price shown first, a real free time booked through Scheduling's
 * own Bring back and Book it, the surveyor told and a text to the customer at
 * once; twice, then a request.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'rebook-now-secret-long-enough-xxxxxxxx', IP_SALT: 'rebook-now-salt-long-enough-for-the-check-xx', SMS_QUIET_HOURS: 'off', SMS_AUTO: 'on',
  TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_DAMPSCAN: 'DampScan' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

let texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (String(url).includes('api.twilio.com')) { texts.push(new URLSearchParams(o.body).get('Body')); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) }; }
  throw new Error('unexpected call ' + url);
};

const R = await import('../lib/portal-rebook.js');
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

async function cancelled() {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Richard Lee', 'ME14 2RP', '07700 900123', 'localised', 21500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [day(6)])).rows[0].id);
  await pool.query("update jobs set status = 'cancelled', date_set = false where id = $1", [id]);
  return id;
}
const load = async (id) => (await pool.query('select j.*, j.job_date::text as job_day from jobs j where j.id = $1', [id])).rows[0];

test('booked again there and then: the same survey shown first, a real time, the customer texted at once', async () => {
  const id = await cancelled();
  await pool.query("insert into lab_flags (key, enabled) values ('instant_booking', false)");
  assert.equal(await R.rebooksItself(await load(id)), false, 'switch off: a request');
  await pool.query("update lab_flags set enabled = true where key = 'instant_booking'");
  const seen = await R.pageTimes(await load(id));
  assert.equal(seen.self, true);
  assert.equal(seen.survey.price, '£215', 'the same survey and price as before, to confirm');
  assert.ok(!JSON.stringify(seen.days).includes('ben'), 'never who');
  const pick = seen.days.find((d) => d.date === day(7));
  assert.ok(pick && pick.times.includes('13:00'));
  assert.match((await R.rebookNow(req, await load(id), { date: day(7), time: '23:00' })).error, /taken/, 'only a time really offered');
  assert.equal((await load(id)).status, 'cancelled', 'a refused time leaves it as it was');
  assert.deepEqual(await R.rebookNow(req, await load(id), { date: day(7), time: '13:00' }), { ok: true, booked: { date: day(7), time: '13:00' } });
  const j = await load(id);
  assert.deepEqual([j.status, j.date_set, j.job_day, String(j.job_time).slice(0, 5), j.surveyor, j.survey_price_pence], ['booked', true, day(7), '13:00', 'ben', 21500]);
  assert.equal(j.cancelled_at, null);
  await flushDue();
  assert.ok(texts.length >= 1, 'the customer has a text');
  assert.match(texts.at(-1), /Richard/);
  const log = j.sched_log.map((e) => e.note).join(' | ');
  assert.match(log, /Booked again on their page for .*, the same survey/);
  assert.match((await pool.query("select title from notifications where kind = 'portal_move'")).rows[0].title, /Booked again by the customer/);
});
