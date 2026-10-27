/**
 * Picking a time on the website: off until the owners switch it on; the
 * customer's postcode decides the best times; two days' notice; nothing
 * after a buyer's deadline; a pick is checked again and held as a request;
 * a forged or taken time is refused. Also: a second form from the same
 * person folds into one card, a survey's length comes from the rate card,
 * and a job with no agreed day does not block anyone's free time.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'web-booking-secret-long-enough-xxxxxx';
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
const { mergeDuplicates } = await import('../lib/merge-dupes.js');
const { deadlineDate } = await import('../lib/deadline.js');
const { freeSlots } = await import('../lib/availability.js');
const { blocker } = await import('../lib/travel.js');
const TODAY = '2030-06-03';
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, survey_type, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', $1, $2, $3, $4, $5, $6, $7, 0, 0, '', '', '', 0, 0, 0, 5000)`;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('CT51AA', 51.36, 1.025), ('CT11AA', 51.28, 1.08), ('N11AA', 51.54, -0.10), ('ME196AB', 51.295, 0.41)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags restart identity cascade');
  await H.setUsual('ben', [0, 1, 2, 3, 4, 5, 6], [{ start: '09:00', end: '17:00' }]);
  await H.setUsual('tom', [0, 1, 2, 3, 4, 5, 6], [{ start: '09:00', end: '17:00' }]);
});
after(async () => { await pool.query('truncate surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags'); await pool.end(); });

const lead = async (extra = {}) => {
  const r = (await pool.query(`insert into leads (site, stage, first_name, postcode, email, phone, notes, session_id) values ('dampscan', 'complete', $1, $2, $3, $4, $5, gen_random_uuid()) returning id, session_id`,
    [extra.name || 'Kim', extra.postcode || 'CT5 1AA', extra.email || 'kim@x.com', extra.phone || null, extra.notes || null])).rows[0];
  return { leadId: Number(r.id), sessionId: r.session_id };
};

test('off until switched on; then best times for their postcode, two days on, before their deadline', async () => {
  const l = await lead({ notes: 'Buying this property, report needed quickly (by Fri 7 Jun).' });
  assert.equal((await W.timesFor({ ...l, today: TODAY })).off, true);
  await pool.query("insert into lab_flags (key, enabled) values ('booking_slots', true)");
  await pool.query(JOB, ['ben', '2030-06-06', '10:00', true, 'Pat', 'CT1 1AA', null]);
  const t = (await W.timesFor({ ...l, today: TODAY })).times;
  assert.ok(t.length >= 1 && t.length <= 6);
  assert.equal(t[0].date, '2030-06-06', 'the day Ben is already near');
  assert.ok(t.every((x) => x.date >= '2030-06-05' && x.date <= '2030-06-07'), 'two days on, by the deadline');
  assert.ok(t.every((x) => !('surveyor' in x)), 'who goes is not shown');
  assert.deepEqual((await W.timesFor({ leadId: l.leadId, sessionId: '00000000-0000-0000-0000-000000000000', today: TODAY })), { error: 'not_found' });
});

test('a pick is checked again, held as a request and alerted; forged or taken times are refused', async () => {
  await pool.query("insert into lab_flags (key, enabled) values ('booking_slots', true)");
  const a = await lead(), b = await lead({ name: 'Raj', email: 'raj@x.com' });
  const ta = (await W.timesFor({ ...a, today: TODAY })).times[0];
  const tb = (await W.timesFor({ ...b, today: TODAY })).times[0];
  assert.deepEqual(await W.pickTime({ ...a, ...ta, ticket: 'tom.forged', today: TODAY }), { error: 'bad_ticket' });
  const ok = await W.pickTime({ ...a, ...ta, today: TODAY });
  assert.equal(ok.ok, true);
  const l = (await pool.query('select pencil_date, pencil_by, sched_log from leads where id = $1', [a.leadId])).rows[0];
  assert.equal(l.pencil_by, 'Website');
  assert.match(l.sched_log[0].note, /Picked .* on the website/);
  assert.match((await pool.query('select title from notifications')).rows[0].title, /Time requested/);
  if (tb.date === ta.date && tb.time === ta.time) assert.deepEqual(await W.pickTime({ ...b, ...tb, today: TODAY }), { error: 'taken' });
  assert.equal((await W.timesFor({ ...a, today: TODAY })).held, true, 'one request at a time');
});

test('the same person sending the form again is one card', async () => {
  const first = await lead({ phone: '07700 900123' });
  await pool.query(`update leads set sched_log = '[{"how":"call","note":"Left a message","at":"2030-06-01T10:00:00Z"}]', sched_wanted = 'Sat am', sched_stage = 'contacted' where id = $1`, [first.leadId]);
  const second = await lead({ email: 'other@x.com', phone: '+447700900123' });
  assert.equal(await mergeDuplicates(second.leadId), 1);
  const [o, n] = (await pool.query('select id, closed_reason, merged_into, sched_log, sched_wanted from leads order by id')).rows;
  assert.match(o.closed_reason, /Duplicate/);
  assert.equal(Number(o.merged_into), second.leadId);
  assert.equal(n.sched_wanted, 'Sat am');
  assert.deepEqual(n.sched_log.map((x) => x.how), ['call', 'note']);
});

test('deadlines, survey length and undated jobs', async () => {
  assert.equal(deadlineDate('Wed 4 Nov', '2026-10-27'), '2026-11-04');
  assert.equal(deadlineDate('Fri 8 Jan', '2026-10-27'), '2027-01-08');
  assert.ok(blocker('11:00', null, [{ time: '09:00', minutes: 120 }], new Map()), 'a two hour survey at 9 runs into 11 with the drive');
  assert.equal(blocker('11:00', null, [{ time: '09:00', minutes: 60 }], new Map()), null);
  await pool.query(JOB, ['tom', '2030-06-10', null, false, 'Undated', 'N1 1AA', null]);
  await pool.query("update jobs set date_set = false where customer_name = 'Undated'");
  const free = await freeSlots({ today: '2030-06-05', days: 10, perSurveyor: true });
  assert.ok(free.some((s) => s.surveyor === 'tom' && s.date === '2030-06-10'), 'a job with no agreed day blocks nothing');
});
