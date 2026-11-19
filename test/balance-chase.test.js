/**
 * Chasing the balance by hand (the owner, 19 Nov 2026: the final payment could
 * not be chased). Once visited and owed, a text with their page; booked before
 * go-live, the Revolut details and their reference instead, even for a survey
 * the fresh start took out of texts. Once a day, two minutes to undo, never
 * once paid, refused without the Revolut details. A pretend Twilio.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'chase-secret-long-enough-xxxxxxxxxxxxx', IP_SALT: 'chase-salt', SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM_DAMPSCAN: 'DampScan', TWILIO_FROM_ATI: 'ATi Damp' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

let texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (!String(url).includes('api.twilio.com')) throw new Error('unexpected call ' + url);
  const b = new URLSearchParams(o.body); texts.push({ to: b.get('To'), body: b.get('Body') }); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) };
};

const { flushDue } = await import('../lib/texts.js');
const { chaseBalance } = await import('../lib/balance-chase.js');
const { moneyView } = await import('../lib/survey-money.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox restart identity cascade'); texts = [];
  await pool.query("update businesses set old_payment_details = null where slug = 'dampscan'");
});
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const due = () => pool.query("update sms_outbox set send_after = now() where status = 'waiting'");
async function job(o = {}) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp, created_at, texts_off, deposit_paid_at, tick_deposit_pence)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '07700 900123', 'full-house', 29500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000, $2, $3, now(), 14750) returning id`,
  [o.date || day(-2), o.made || new Date().toISOString(), Boolean(o.off)])).rows[0].id);
}

test('visited and owed: the balance and their page, once a day, two minutes to undo, never once paid', async () => {
  const id = await job();
  assert.equal((await moneyView(id)).chase.balancePence, 14750, 'offered on the job card');
  const r = await chaseBalance(id, 'Scott');
  assert.ok(r.ok);
  assert.match((await chaseBalance(id, 'Scott')).error, /today/, 'once a day');
  const w = (await pool.query("select send_after > now() + interval '100 seconds' as later from sms_outbox where id = $1", [r.textId])).rows[0];
  assert.ok(w.later, 'two minutes to undo');
  await due(); await flushDue();
  assert.match(texts[0].body, /^Hi Kim, a reminder from DampScan that the £147\.50 balance for your survey is still to pay\. It only takes a minute on your page: https:\/\/dampscan\.co\.uk\/m\//);
  const ahead = await job({ date: day(3) });
  assert.equal((await moneyView(ahead)).chase, null, 'not before the visit');
  assert.ok((await chaseBalance(ahead, 'Scott')).error);
  const later = await job();
  assert.ok((await chaseBalance(later, 'Scott')).ok);
  await pool.query('update jobs set paid_at = now(), tick_paid_pence = 29500 where id = $1', [later]);
  await due(); await flushDue();
  assert.equal(texts.length, 1, 'paid meanwhile: it never goes');
});

test('booked before go-live: the Revolut details and their reference, even after the fresh start; refused until the details are in', async () => {
  const id = await job({ made: '2026-11-10T10:00:00Z', off: true });
  assert.ok((await moneyView(id)).chase.bankMissing);
  assert.match((await chaseBalance(id, 'Scott')).error, /Revolut details/);
  await pool.query("update businesses set old_payment_details = 'Damp Surveying Limited, sort code 04-00-75, account 12345678' where slug = 'dampscan'");
  assert.ok((await chaseBalance(id, 'Scott')).ok, 'a person chose it, so the fresh start does not stop it');
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0].body, /balance for your survey is still to pay\. Please pay it by bank transfer to Damp Surveying Limited, sort code 04-00-75, account 12345678, with the reference KIM0001\./);
  assert.doesNotMatch(texts[0].body, /\/m\//, 'no page link');
});
