/**
 * The timings audit (13 Nov 2026): drive times from real roads with a traffic
 * allowance; every check uses the real length of the survey being booked (a
 * Full House is two hours, not one); and booking online straight away offers
 * only times that fit the survey the customer chose, so the time they tap is
 * booked, right first time, never a request.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'timings-secret-long-enough-xxxxxxxxxxx';
process.env.SMS_QUIET_HOURS = 'off';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { driveMinutes, places } = await import('../lib/travel.js');
const { travelClash, surveyMinutes } = await import('../lib/travel-guard.js');
const { clashFor } = await import('../lib/scheduling.js');
const W = await import('../lib/web-booking.js');
const H = await import('../lib/hours-store.js');
const { memo } = await import('../lib/road-times.js');

const TODAY = '2030-06-03';
const DAY = '2030-06-06';
before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('ME142RP', 51.2803, 0.5313), ('ME144EW', 51.2860, 0.5585), ('CT51AA', 51.36, 1.025)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags, drive_times, sms_outbox restart identity cascade');
  memo.clear();
  await H.setUsual('ben', [0, 1, 2, 3, 4, 5, 6], [{ start: '09:00', end: '17:00' }]);
});
after(async () => { await pool.query('truncate surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags, drive_times'); await pool.end(); });

const job = (time, pc, type) => pool.query(`insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, survey_type, survey_price_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'ben', $1, $2, true, 'Pat', $3, $4, 29500, 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY, time, pc, type]).then((r) => Number(r.rows[0].id));

test('a road time is used, with traffic and parking; without one the estimate is near real roads, not double', async () => {
  const a = { lat: 51.2803, lon: 0.5313 }, b = { lat: 51.2860, lon: 0.5585 };
  await pool.query(`insert into drive_times (pair, minutes) values ('51.2803,0.5313|51.2860,0.5585', 8)`);
  await places(['ME14 2RP', 'ME14 4EW']);
  assert.equal(driveMinutes(a, b), 20, '8 minutes by road, +20% traffic, +10 to park, to the next 5');
  memo.clear();
  /* Gravesend to Hythe: the old guess said 125 minutes; roads say about 55, so with traffic about 75. */
  const est = driveMinutes({ lat: 51.4413, lon: 0.3685 }, { lat: 51.0716, lon: 1.0844 });
  assert.ok(est >= 60 && est <= 95, `estimate ${est}`);
});

test('every check uses the real length: a Full House is two hours, not one', async () => {
  await job('12:00', 'ME14 4EW', 'localised');
  const full = await surveyMinutes({ surveyType: 'full-house' });
  assert.equal(full, 120);
  assert.equal(await surveyMinutes({ surveyType: 'full-house', extras: ['camera'] }), 150, 'each extra adds 30');
  assert.ok(await travelClash({ surveyor: 'ben', site: 'dampscan', date: DAY, time: '10:00', postcode: 'ME14 2RP', minutes: full }), 'a two hour survey at 10 runs into the 12:00');
  assert.equal(await travelClash({ surveyor: 'ben', site: 'dampscan', date: DAY, time: '10:00', postcode: 'ME14 2RP', minutes: 60 }), null, 'an hour at 10 fits');
  assert.match(await clashFor('ben', DAY, '15:00', null, 'ME14 2RP', 180), /180 minute survey/, 'three hours from 3pm runs past 5pm');
});

test('booked online straight away: the survey first, only times that fit it, and the tap books it', async () => {
  await pool.query("insert into lab_flags (key, enabled) values ('booking_slots', true), ('instant_booking', true)");
  await job('12:00', 'ME14 4EW', 'localised');
  const r = (await pool.query(`insert into leads (site, stage, first_name, postcode, email, phone, session_id) values ('dampscan', 'complete', 'Kim', 'ME14 2RP', 'k@x.com', '07700900123', gen_random_uuid()) returning id, session_id`)).rows[0];
  const l = { leadId: Number(r.id), sessionId: r.session_id };
  const first = await W.timesFor({ ...l, today: TODAY });
  assert.equal(first.surveyFirst, true, 'no times until the survey is chosen');
  assert.equal((await W.saveSurvey({ ...l, choice: { service: 'unsure', size: 'full-house', extras: [] } })).ok, true, 'not sure still gives the size');
  const t = await W.timesFor({ ...l, today: TODAY });
  const day = t.days.find((d) => d.date === DAY);
  const times = day.times.map((x) => x.time);
  assert.ok(!times.includes('10:00') && !times.includes('11:00'), 'a two hour survey is never offered into the 12:00');
  const pick = day.times[day.times.length - 1];
  const out = await W.pickTime({ ...l, date: DAY, time: pick.time, ticket: pick.ticket, today: TODAY });
  assert.deepEqual([out.ok, out.booked], [true, true]);
  const j = (await pool.query('select status, survey_type, surveyor, to_char(job_time, \'HH24:MI\') as t from jobs where lead_id = $1', [l.leadId])).rows[0];
  assert.deepEqual(j, { status: 'booked', survey_type: 'full-house', surveyor: 'ben', t: pick.time });
  assert.equal((await pool.query('select pencil_date from leads where id = $1', [l.leadId])).rows[0].pencil_date, null, 'a booking, not a held request');
});
