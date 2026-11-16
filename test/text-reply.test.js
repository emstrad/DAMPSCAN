/**
 * Replying by text (the owner's ask, 16 Nov 2026): the team types a reply in
 * the job pop-up, it goes from the brand two minutes later with their page to
 * write back, Undo stops it, and once gone it is on their history (Needs you
 * now lets go) and on their page under what they wrote. A pretend Twilio.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'reply-secret-long-enough-xxxxxxxxxxxxx', IP_SALT: 'reply-salt', SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM_DAMPSCAN: 'DampScan', TWILIO_FROM_ATI: 'ATi Damp' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

let texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (!String(url).includes('api.twilio.com')) throw new Error('unexpected call ' + url);
  const b = new URLSearchParams(o.body); texts.push({ to: b.get('To'), from: b.get('From'), body: b.get('Body') }); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) };
};

const { flushDue } = await import('../lib/texts.js');
const { queueReply } = await import('../lib/text-reply.js');
const { askOf } = await import('../lib/page-asks.js');
const { sentMessages } = await import('../lib/portal-view.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, estate_agents restart identity cascade'); texts = []; });
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const due = () => pool.query("update sms_outbox set send_after = now() where status = 'waiting'");
async function job(phone = '07700 900123') {
  const log = JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note: 'They wrote on their page: Can I park on the drive?' }]);
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp, sched_log)
    values ('ati-london', 'booked', 'Kim Lee', 'N7 0JE', $1, 'full-house', 29500, true, $2, '09:00', 'tom', 0, 0, '', '', '', 0, 0, 0, 5000, $3::jsonb) returning id`, [phone, day(3), log])).rows[0].id);
}
const row = async (id) => (await pool.query('select * from jobs where id = $1', [id])).rows[0];

test('a reply goes from the brand after two minutes, signed, with their page; then it is on their history and their page', async () => {
  const id = await job();
  assert.equal(askOf(await row(id)).what, 'message', 'their message waits for a reply');
  const r = await queueReply(id, 'Hi Kim, yes, park on the drive.', 'Scott Elson');
  assert.ok(r.ok);
  await flushDue();
  assert.equal(texts.length, 0, 'two minutes to undo first');
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.equal(texts[0].from, 'ATi Damp');
  assert.match(texts[0].body, /^Hi Kim, yes, park on the drive\.\n\nScott, ATi Damp Survey\nTo reply, message us on your page: https:\/\/\S+\/m\/[\w-]{32}$/);
  const j = await row(id);
  assert.equal(askOf(j), null, 'answered: off Needs you now');
  const page = sentMessages(j);
  assert.deepEqual(page.map((m) => [m.from || 'them', m.text]), [['them', 'Can I park on the drive?'], ['us', 'Hi Kim, yes, park on the drive.']]);
  assert.equal(page[1].who, 'Scott');
});

test('Undo stops it; the owners\' code signs as the brand; no mobile is refused', async () => {
  const id = await job();
  const r = await queueReply(id, 'On our way soon.', 'Owners');
  await pool.query("update sms_outbox set status = 'cancelled', error = 'Stopped by Scott.' where id = $1", [r.textId]);
  await due(); await flushDue();
  assert.equal(texts.length, 0, 'stopped: nothing sent');
  assert.equal(askOf(await row(id)).what, 'message', 'still waiting for a reply');
  await queueReply(id, 'Sorry, yes.', 'Owners');
  await due(); await flushDue();
  assert.match(texts[0].body, /\n\nATi Damp Survey\n/);
  assert.equal(sentMessages(await row(id))[1].who, null);
  const land = await job('020 7946 0000');
  assert.match((await queueReply(land, 'Hello', 'Scott')).error, /No mobile/);
  assert.ok((await queueReply(id, ' ', 'Scott')).error, 'nothing typed');
});
