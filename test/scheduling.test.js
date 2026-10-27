/**
 * The Scheduling board: a website enquiry starts in New, a logged call moves
 * it to Contacted, and booking it makes the job. A time outside the
 * surveyor's own hours or next to their booked survey is refused with the
 * reason until the person says book anyway. Ronnie's work login is refused.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'sched-secret-long-enough-xxxxxxxxxxxx';
process.env.IP_SALT = 'sched-salt-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { scopeFor } = await import('../lib/access.js');
const { callRoute } = await import('../lib/mcp/shared.js');
const route = (await import('../lib/routes/admin/scheduling.js')).default;
const owners = () => scopeFor({ person: false, name: 'Owners' });
const call = async (scope, body) => callRoute(route, scope, body ? { method: 'POST', url: '/api/admin/scheduling', body } : { method: 'GET', url: '/api/admin/scheduling' });

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into job_rates (key, label, price_pence, surveyor_fee_pence, position) values ('localised', 'Localised', 25000, 11000, 1) on conflict (key) do nothing`);
});
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = async () => (await pool.query(`insert into leads (site, stage, first_name, postcode, phone, email, session_id)
  values ('dampscan', 'complete', 'Kim', 'ME19 6AB', '07700900000', 'kim@example.com', gen_random_uuid()) returning id`)).rows[0].id;

test('an enquiry goes New, Contacted, then booked into a job', async () => {
  const id = Number(await lead());
  const s = await owners();
  let b = (await call(s)).data;
  assert.equal(b.cards.length, 1);
  assert.equal(b.cards[0].stage, 'new');
  assert.equal((await call(s, { op: 'log', kind: 'lead', id, how: 'call', note: 'Wants a Saturday' })).status, 200);
  b = (await call(s)).data;
  assert.equal(b.cards[0].stage, 'contacted');
  assert.match(b.cards[0].log[0].note, /Saturday/);
  await call(s, { op: 'wanted', kind: 'lead', id, text: 'Sat morning' });
  await call(s, { op: 'move', kind: 'lead', id, to: 'waiting' });
  b = (await call(s)).data;
  assert.equal(b.cards[0].stage, 'waiting');
  assert.equal(b.cards[0].wanted, 'Sat morning');

  const date = '2030-06-01';
  const refused = await call(s, { op: 'book', kind: 'lead', id, date, time: '10:00', surveyor: 'tom', surveyType: 'localised' });
  assert.equal(refused.status, 400);
  assert.match(refused.data.clash, /not set hours/);
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ('tom', $1, '09:00', '17:00')`, [date]);
  const ok = await call(s, { op: 'book', kind: 'lead', id, date, time: '10:00', surveyor: 'tom', surveyType: 'localised' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const j = (await pool.query('select * from jobs')).rows[0];
  assert.equal(Number(j.lead_id), id);
  assert.equal(j.surveyor, 'tom');
  assert.equal(String(j.job_time).slice(0, 5), '10:00');
  assert.equal((await call(s)).data.cards.length, 0, 'booked leaves the board');

  const id2 = Number(await lead());
  const near = await call(s, { op: 'book', kind: 'lead', id: id2, date, time: '11:00', surveyor: 'tom', surveyType: 'localised' });
  assert.match(near.data.clash, /has Kim at 10:00/);
  const forced = await call(s, { op: 'book', kind: 'lead', id: id2, date, time: '11:00', surveyor: 'tom', surveyType: 'localised', force: true });
  assert.equal(forced.status, 200, JSON.stringify(forced.data));
});

test('the work login cannot see or change the board', async () => {
  const ronnie = { isAdmin: false, personId: 9, name: 'Ronnie', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'work', 'ati-london': 'work' } };
  assert.equal((await call(ronnie)).status, 403);
});
