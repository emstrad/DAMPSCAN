/**
 * The second alert and the safety net: a damp enquiry's alert opens the
 * Scheduling board, an enquiry untouched for two hours in working hours is
 * nudged once (never at night, never once a call is logged), and Microsoft
 * 365 is only tried for the email when switched on.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'nudge-secret-long-enough-xxxxxxxxxxxxx';
process.env.IP_SALT = 'nudge-salt-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { nudgeUntouched } = await import('../lib/enquiry-nudge.js');
const { enquiryAlert } = await import('../lib/alert-enquiry.js');
const { sendLeadEmail } = await import('../lib/lead-email.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, audit, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

const NOON = new Date(); NOON.setUTCDate(NOON.getUTCDate() - 1); NOON.setUTCHours(12, 0, 0, 0);
const lead = async (hoursAgo) => Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id, created_at)
  values ('dampscan', 'complete', 'Kim', 'ME19 6AB', 'k@x.com', gen_random_uuid(), $2::timestamptz - make_interval(hours => $1)) returning id`, [hoursAgo, NOON.toISOString()])).rows[0].id);

test('a damp enquiry alert opens the Scheduling board at its card', () => {
  const a = enquiryAlert('dampscan', 7, { first_name: 'Kim', postcode: 'ME19 6AB', phone: '07700900000', issues: [] });
  assert.equal(a.path, '/schedule.html#lead-7');
  assert.equal(a.kind, 'enquiry', 'enquiry alerts go to ntfy and the staff app both');
  assert.match(enquiryAlert('roofing', 8, { first_name: 'Al', postcode: 'BR1 1AA', issues: [] }).path, /dashboard/);
});

test('untouched for two hours in working hours: nudged once; touched or at night: not', async () => {
  const kim = await lead(3);
  const called = await lead(3);
  await pool.query(`update leads set sched_log = '[{"how":"call"}]'::jsonb where id = $1`, [called]);
  await lead(1);
  const noon = NOON;
  const night = new Date(NOON.getTime() + 11 * 3600000);
  assert.deepEqual(await nudgeUntouched(night), { nudged: 0 });
  assert.deepEqual(await nudgeUntouched(noon), { nudged: 1 });
  assert.deepEqual(await nudgeUntouched(noon), { nudged: 0 }, 'once only');
  const n = (await pool.query('select title, message, ref from notifications')).rows;
  assert.equal(Number(n[0].ref), kim);
  assert.match(n[0].title, /Still waiting/);
  assert.doesNotMatch(n[0].message, /6AB/, 'postcode district only');
});

test('Microsoft 365 is skipped for the email unless switched on', async () => {
  Object.assign(process.env, { M365_USER: 'a@b.com', M365_APP_PASSWORD: 'x' });
  let used = null;
  const fetchImpl = async (url) => { used = String(url); return { ok: true, status: 200, text: async () => JSON.stringify({ success: 'true' }) }; };
  const out = await sendLeadEmail({ site: 'dampscan', stage: 'complete', value: { firstName: 'Kim', email: 'k@x.com', postcode: 'ME19 6AB', issues: [] }, id: 1, fetchImpl });
  assert.equal(out.ok, true);
  assert.match(used, /formsubmit/);
  delete process.env.M365_USER; delete process.env.M365_APP_PASSWORD;
});
