/**
 * The evening route check calls out a time too tight for the drive; a
 * cancelled survey's gap is offered to the waiting customer who fits it; and
 * customer texts are off until switched on, then go through Twilio.
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
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: init.body }); return { ok: true, status: 200, json: async () => ({}) }; };
const { routeCheck } = await import('../lib/route-check.js');
const { offerFreedSlot } = await import('../lib/cancel-fill.js');
const { sendText, textFor, textJob } = await import('../lib/sms.js');
const H = await import('../lib/hours-store.js');
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', $1, $2, $3, true, $4, $5, 0, 0, '', '', '', 0, 0, 0, 5000)`;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('CT51AA', 51.36, 1.025), ('CT11AA', 51.28, 1.08), ('N11AA', 51.54, -0.10)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => {
  sent.length = 0;
  await pool.query('truncate jobs, leads, notifications, surveyor_hours, surveyor_usual, surveyor_day_set, route_sent restart identity cascade');
  process.env.NTFY_TOPIC = 'owners'; process.env.NTFY_TOPIC_BEN = 'ben';
});
after(async () => { for (const k of ['NTFY_TOPIC', 'NTFY_TOPIC_BEN', 'SMS_AUTO', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k]; await pool.query('truncate surveyor_usual'); await pool.end(); });

test('the route check calls out a time too tight for the drive', async () => {
  await H.setUsual('ben', [0, 1, 2, 3, 4, 5, 6], [{ start: '08:00', end: '18:00' }]);
  await pool.query(JOB, ['ben', '2030-06-04', '09:00', 'Lee', 'N1 1AA']);
  await pool.query(JOB, ['ben', '2030-06-04', '10:15', 'Pat', 'CT5 1AA']);
  const out = await routeCheck('2030-06-04');
  assert.equal(out[0].surveyor, 'ben');
  assert.ok(out[0].problems.some((p) => /tight/.test(p)));
  const ben = sent.find((s) => JSON.parse(s.body).topic === 'ben');
  assert.match(JSON.parse(ben.body).message, /^Check:/);
  assert.match((await pool.query('select title from notifications')).rows[0].title, /Route check: Ben/);
});

test('a freed slot is offered to the waiting customer who fits', async () => {
  const day = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await H.setUsual('ben', [0, 1, 2, 3, 4, 5, 6], [{ start: '09:00', end: '17:00' }]);
  await pool.query(JOB, ['ben', day, '10:00', 'Pat', 'CT1 1AA']);
  await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('dampscan', 'complete', 'Kim', 'CT5 1AA', 'k@x.com', gen_random_uuid())`);
  const could = await offerFreedSlot({ surveyor: 'ben', date: day, time: '13:00', site: 'dampscan' });
  assert.equal(could.length, 1);
  assert.match((await pool.query("select title, message from notifications")).rows[0].message, /Could fit: Kim, CT5/);
});

test('texts are off until switched on, then go to Twilio with the words', async () => {
  assert.deepEqual(await sendText({ to: '07700900123', body: 'hi' }), { sent: false, why: 'off' });
  Object.assign(process.env, { SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+441234' });
  const body = textFor('confirm', { site: 'dampscan', jobDate: '2030-06-04', jobTime: '10:00', customerName: 'Kim Smith', customerPostcode: 'ME19 6AB' });
  assert.match(body, /^Hi Kim, your survey with DampScan is booked for Tuesday 4 June at 10:00/);
  assert.deepEqual(await sendText({ to: '07700900123', body }), { sent: true });
  assert.match(sent.at(-1).url, /api\.twilio\.com\/2010-04-01\/Accounts\/AC1\/Messages\.json/);
  assert.match(String(sent.at(-1).body), /To=%2B447700900123/);
  assert.deepEqual(await sendText({ to: '01622 123456', body }), { sent: false, why: 'no_mobile' }, 'a landline cannot take a text');
  /* A booked survey with only a landline: one to-do for the owners, never two. */
  const id = (await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', 'booked', 'Kim Smith', 'ME19 6AB', '01622 123456', 2000, 1000, 'scott', 'tom', 'ben') returning id`)).rows[0].id;
  await textJob(id, 'confirm'); await textJob(id, 'confirm');
  const todos = (await pool.query('select text, for_owners from todos where job_id = $1', [id])).rows;
  assert.equal(todos.length, 1);
  assert.match(todos[0].text, /^No mobile for Kim \(ME19\): the booking confirmation text could not go/);
  for (const k of ['SMS_AUTO', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k];
});
