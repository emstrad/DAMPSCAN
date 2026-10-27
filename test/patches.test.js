/**
 * Who covers where on the website picker: Tom first for London, Ben and
 * Ronnie first for Kent; a time the patch surveyor cannot do goes to
 * someone who can reach it, or is not offered at all; booked surveys and
 * the drive either side are kept clear; a pick is held for that surveyor.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'patches-secret-long-enough-xxxxxxxxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});
const W = await import('../lib/web-booking.js');
const H = await import('../lib/hours-store.js');
const { patchOf } = await import('../lib/patches.js');
const TODAY = '2030-06-03';
const MON = '2030-06-10';
const log = (...a) => { if (process.env.WALKTHROUGH) console.log(...a); };

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags restart identity cascade');
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('SE154AB', 51.47, -0.065), ('SE11AA', 51.50, -0.09), ('ME141AA', 51.276, 0.522), ('ME196AB', 51.295, 0.41)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
  await pool.query("insert into lab_flags (key, enabled) values ('booking_slots', true)");
  for (const [who, end] of [['tom', '17:00'], ['ben', '17:00'], ['ronnie', '13:00']]) await H.addHours({ personId: null }, who, MON, '09:00', end);
  await pool.query(`insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('ati-london', 'booked', 'tom', $1, '13:00', true, 'Pat', 'SE15 4AB', 0, 0, '', '', '')`, [MON]);
});
after(async () => { await pool.query('truncate jobs, leads, surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags restart identity cascade'); await pool.end(); });

const lead = async (name, postcode) => {
  const r = (await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('ati-london', 'complete', $1, $2, $3, gen_random_uuid()) returning id, session_id`,
    [name, postcode, name.toLowerCase() + '@x.com'])).rows[0];
  return { leadId: Number(r.id), sessionId: r.session_id };
};
/* Who each offered time would go to (the customer never sees this; the ticket carries it). */
const whoFor = (day) => day.times.map((t) => `${t.time} ${t.ticket.split('.')[0]}`);

test('the patch of a postcode', () => {
  assert.equal(patchOf('SE15 4AB'), 'london');
  assert.equal(patchOf('ME14 1AA'), 'kent');
  assert.equal(patchOf('DA1 1AA'), 'kent', 'Dartford');
  assert.equal(patchOf('DA15 8JN'), 'london', 'Sidcup');
});

test('a Maidstone customer is offered Kent surveyors; a London one gets Tom first, and an hour nobody can reach is not offered', async () => {
  const kent = await lead('Kim', 'ME14 1AA');
  const k = (await W.timesFor({ ...kent, today: TODAY })).days.find((d) => d.date === MON);
  log('Maidstone ME14, Monday:', whoFor(k).join(', '));
  assert.ok(k.times.length > 0);
  assert.ok(whoFor(k).every((x) => !x.endsWith('tom')), 'Tom covers London, so Kent times go to Ben or Ronnie');

  const ldn = await lead('Lee', 'SE1 1AA');
  const l = (await W.timesFor({ ...ldn, today: TODAY })).days.find((d) => d.date === MON);
  log('London SE1, Monday:', whoFor(l).join(', '));
  const tom = whoFor(l).filter((x) => x.endsWith('tom')).map((x) => x.slice(0, 5));
  assert.ok(tom.includes('09:00') && tom.includes('15:00'), 'Tom first for London');
  assert.ok(!tom.includes('13:00'), 'not while Tom is at his 1pm survey');
  /* Ben could take it, but central London is over two hours from West Malling: nobody can, so it is not offered. */
  assert.ok(!whoFor(l).some((x) => x.startsWith('13:00')), 'nobody can reach SE1 at 1pm, so it is not offered');

  const pick = l.times.find((t) => t.time === '15:00');
  assert.equal((await W.pickTime({ ...ldn, ...pick, today: TODAY })).ok, true);
  const held = (await pool.query('select pencil_date::text as d, to_char(pencil_time, \'HH24:MI\') as t, pencil_surveyor as s from leads where id = $1', [ldn.leadId])).rows[0];
  log('Lee picked Monday 3pm: held for', held.s, held.d, held.t, '(a request for the team to confirm)');
  assert.deepEqual(held, { d: MON, t: '15:00', s: 'tom' });
});
