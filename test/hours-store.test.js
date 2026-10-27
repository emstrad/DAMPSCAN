/**
 * My hours the easy way: the usual week fills every day not changed by hand;
 * ticked days change together (set, add, off, back to usual); and the usual
 * week can be learnt from the days someone has been setting. Then the best
 * times: nearby days first, never a leg over the limit, fresh days last.
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
const H = await import('../lib/hours-store.js');
const { bestFits } = await import('../lib/best-fit.js');
const scope = { personId: null, name: 'Owners' };
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', $1, $2, $3, true, $4, $5, 0, 0, '', '', '', 0, 0, 0, 5000)`;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('CT51AA', 51.36, 1.025), ('CT11AA', 51.28, 1.08), ('N11AA', 51.54, -0.10), ('ME196AB', 51.295, 0.41)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => { await pool.query('truncate jobs, leads, surveyor_hours, surveyor_usual, surveyor_day_set restart identity cascade'); });
after(async () => { await pool.query('truncate surveyor_hours, surveyor_usual, surveyor_day_set'); await pool.end(); });

test('the usual week fills every day; a ticked day changes on its own and goes back', async () => {
  await H.setUsual('tom', [1, 2, 3, 4, 5], [{ start: '17:00', end: '19:00' }]);
  await H.setUsual('tom', [6], [{ start: '09:00', end: '17:00' }]);
  const mon = '2030-06-03', sat = '2030-06-08', sun = '2030-06-09';
  let h = await H.listHours('tom', mon, sun);
  assert.equal(h.filter((x) => x.date === mon)[0].start, '17:00');
  assert.equal(h.filter((x) => x.date === sun).length, 0, 'Sunday: nothing in the usual week');
  await H.bulk(scope, 'tom', { dates: [mon, sat], action: 'off' });
  await H.bulk(scope, 'tom', { dates: [sun], action: 'replace', start: '10:00', end: '12:00' });
  h = await H.listHours('tom', mon, sun);
  assert.equal(h.filter((x) => x.date === mon).length, 0);
  assert.equal(h.filter((x) => x.date === sun)[0].source, 'set');
  await H.bulk(scope, 'tom', { dates: [mon], action: 'add', start: '09:00', end: '10:00' });
  assert.deepEqual((await H.listHours('tom', mon, mon)).map((x) => x.start), ['09:00']);
  await H.bulk(scope, 'tom', { dates: [mon], action: 'usual' });
  assert.deepEqual((await H.listHours('tom', mon, mon)).map((x) => x.start), ['17:00']);
  await H.removeWindow('tom', '2030-06-04', '17:00', '19:00');
  assert.equal((await H.listHours('tom', '2030-06-04', '2030-06-04')).length, 0, 'one usual window off one day');
});

test('the usual week is learnt from the days someone has set', async () => {
  await H.addHours(scope, 'ben', '2030-06-01', '09:00', '13:00');
  await H.addHours(scope, 'ben', '2030-06-03', '18:00', '20:00');
  await H.learnUsual('ben', '2030-06-05');
  const u = await H.usualWeek('ben');
  assert.deepEqual(u.map((x) => [Number(x.weekday), x.start]), [[1, '18:00'], [6, '09:00']]);
  assert.equal((await H.listHours('ben', '2030-06-15', '2030-06-15'))[0].source, 'usual', 'a later Saturday now fills itself');
});

test('best times: nearby first, never a long hop, fresh days after', async () => {
  const d1 = '2030-06-04', d2 = '2030-06-05', d3 = '2030-06-06';
  await H.setUsual('ben', [2, 3, 4], [{ start: '09:00', end: '17:00' }]);
  await H.setUsual('tom', [2, 3, 4], [{ start: '09:00', end: '17:00' }]);
  await pool.query(JOB, ['ben', d1, '10:00', 'Pat', 'CT1 1AA']);
  await pool.query(JOB, ['tom', d1, '10:00', 'Lee', 'N1 1AA']);
  await pool.query(JOB, ['tom', d2, '11:00', 'Lee2', 'N1 1AA']);
  const { fits } = await bestFits([{ kind: 'lead', id: 1, postcode: 'CT5 1AA' }], ['dampscan'], '2030-06-03');
  const best = fits.get('lead:1').best;
  assert.equal(best[0].surveyor, 'ben');
  assert.equal(best[0].date, d1);
  assert.match(best[0].why, /Ben is at Pat in CT1/);
  assert.ok(toMinutes(best[0].time) >= 11 * 60, 'after Pat plus the drive, snug');
  assert.ok(!best.some((o) => o.surveyor === 'tom' && o.date === d1), 'no North London to Whitstable hop for Tom');
  assert.ok(best.some((o) => o.tier === 2), 'a fresh day is still offered');
  assert.ok(best.length >= 2 && best.length <= 5);
  assert.ok(best.every((o) => o.date !== d3 || o.tier === 2));
});
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
