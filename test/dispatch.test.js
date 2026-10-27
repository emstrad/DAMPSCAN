/**
 * The dispatch day: a lane for each surveyor working it, their surveys with
 * the drive to the next, holds, and free starts that leave room for the
 * drive; nobody without hours or work that day; and the week strip counts.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});
const { day, week } = await import('../lib/dispatch.js');
const DATE = '2030-06-01';
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', $1, $2, $3, true, $4, $5, 0, 0, '', '', '', 0, 0, 0, 5000)`;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('BR11AA', 51.405, 0.015), ('ME196AB', 51.295, 0.41)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => { await pool.query('truncate jobs, leads, surveyor_hours restart identity cascade'); });
after(async () => { await pool.end(); });

test('lanes show surveys, the drive between them and the free starts left', async () => {
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ('tom', $1, '09:00', '17:00')`, [DATE]);
  await pool.query(JOB, ['tom', DATE, '10:00', 'Lee', 'BR1 1AA']);
  await pool.query(JOB, ['tom', DATE, '14:00', 'Kim', 'ME19 6AB']);
  const d = await day(['dampscan', 'ati-london'], DATE);
  assert.deepEqual(d.lanes.map((l) => l.surveyor), ['tom'], 'only who is working');
  const tom = d.lanes[0];
  assert.equal(tom.surveys.length, 2);
  assert.ok(tom.surveys[0].driveNext.minutes >= 45 && tom.surveys[0].driveNext.known);
  assert.ok(!tom.free.includes('11:00'), 'right after a survey is the drive');
  assert.ok(tom.free.includes('12:00') || tom.free.includes('16:00'));
  const w = await week(['dampscan'], DATE);
  assert.equal(w.length, 7);
  assert.equal(w[0].surveys, 2);
  assert.deepEqual(w[0].onHours, ['tom']);
});
