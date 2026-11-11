/**
 * Customer texts (the owners' plan, 11 Nov 2026): one outbox, a two-minute
 * wait after a staff change, checked again and worded as it goes, each once,
 * off until switched on, and Twilio's receipts only when truly signed.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'texts-secret-long-enough-xxxxxxxxxxxxx';
process.env.IP_SALT = 'texts-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const T = await import('../lib/texts.js');
const { tellSurveyors } = await import('../lib/surveyor-alerts.js');
const quote = (await import('../api/quote.js')).default;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, sms_outbox, sms_templates restart identity cascade');
  for (const k of ['SMS_AUTO', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_ATI', 'TWILIO_FROM_DAMPSCAN', 'SMS_TEST_TO']) delete process.env[k];
});
after(async () => { await pool.end(); });

const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const job = async (extra = '') => {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('ati-london', 'booked', 'Kim Lee', 'N4 4ED', '07700 900123', 29500, true, $1, '09:00', 'tom', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY])).rows[0].id);
  if (extra) await pool.query(`update jobs set ${extra} where id = $1`, [id]);
  return id;
};
const rows = async () => (await pool.query('select * from sms_outbox order by id')).rows;
const due = () => pool.query("update sms_outbox set send_after = now() - interval '1 second' where status = 'waiting'");
const live = () => Object.assign(process.env, { SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_ATI: 'ATi Damp', TWILIO_FROM_DAMPSCAN: 'DampScan' });

test('a booking waits two minutes, then goes from the brand name with the link, once', async () => {
  const id = await job();
  await tellSurveyors(id);
  let [r] = await rows();
  assert.deepEqual([r.kind, r.status], ['booked', 'waiting']);
  assert.ok(new Date(r.send_after) - Date.now() > 100000, 'two minutes to undo');
  assert.equal(await T.flushDue(), 0, 'nothing goes before its time');
  live();
  const sent = [];
  await due();
  assert.equal(await T.flushDue({ fetchImpl: async (url, o) => { sent.push(Object.fromEntries(o.body)); return { ok: true, json: async () => ({ sid: 'SM1' }) }; } }), 1);
  assert.equal(sent[0].From, 'ATi Damp');
  assert.equal(sent[0].To, '+447700900123');
  assert.match(sent[0].Body, /Hi Kim, your ATi Damp Survey survey is booked for .+, arriving 9 to 10am\. Total £295\. Pay your 50% deposit of £147\.50 here: https:\/\/atidampsurvey\.co\.uk\/my\.html\?t=/);
  [r] = await rows();
  assert.deepEqual([r.status, r.sid], ['sent', 'SM1']);
  await tellSurveyors(id);
  assert.equal((await rows()).length, 1, 'never twice');
});

test('a deposit ticked then unticked inside the two minutes sends nothing; ticked again it sends', async () => {
  const id = await job("surveyor_told = 'tom|" + DAY + "|09:00'");
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [id]);
  await T.textsAfterChange(id);
  await pool.query('update jobs set deposit_paid_at = null where id = $1', [id]);
  await T.textsAfterChange(id);
  await due(); await T.flushDue();
  let r = await rows();
  assert.deepEqual([r[0].kind, r[0].status], ['paid', 'cancelled']);
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [id]);
  await T.textsAfterChange(id);
  await due(); await T.flushDue();
  r = await rows();
  assert.equal(r[1].status, 'off', 'texts are off: kept as what would have gone');
  assert.match(r[1].body, /received £147\.50/);
});

test('a move texts the new time, a second quick move replaces it, an old survey edited texts nothing', async () => {
  const id = await job("surveyor_told = 'tom|" + DAY + "|09:00'");
  await pool.query("update jobs set job_time = '11:00' where id = $1", [id]); await tellSurveyors(id);
  await pool.query("update jobs set job_time = '13:00' where id = $1", [id]); await tellSurveyors(id);
  await due(); await T.flushDue();
  const r = await rows();
  assert.deepEqual(r.map((x) => [x.kind, x.status]), [['moved', 'cancelled'], ['moved', 'off']]);
  assert.match(r[1].body, /1 to 2pm/);
  const old = await job("deposit_paid_at = now() - interval '90 days', paid_at = now() - interval '60 days'");
  await T.textsAfterChange(old);
  assert.equal((await rows()).length, 2, 'a payment from months ago is never texted');
});

test('the morning text asks for an unpaid deposit; the owners\' wording and the test number are used; no mobile is a to-do', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const id = await job(`job_date = '${today}'`);
  await pool.query("insert into sms_templates (kind, site, body) values ('today_unpaid', 'ati-london', 'Morning {first}! Deposit {deposit} please: {link}')");
  live(); process.env.SMS_TEST_TO = '07700 900999';
  assert.equal(await T.morningTexts(today), 1);
  const sent = [];
  await T.flushDue({ fetchImpl: async (u, o) => { sent.push(Object.fromEntries(o.body)); return { ok: true, json: async () => ({}) }; } });
  assert.equal(sent[0].To, '+447700900999');
  assert.match(sent[0].Body, /^Morning Kim! Deposit £147\.50 please: https/);
  delete process.env.SMS_TEST_TO;
  const land = await job("customer_phone = '020 3355 4944'");
  await T.queueText({ kind: 'booked', site: 'ati-london', jobId: land, key: 'booked' });
  await T.flushDue();
  assert.equal((await pool.query('select count(*)::int as n from todos where job_id = $1', [land])).rows[0].n, 1);
});

test('a delivery receipt counts only when Twilio signed it; a failed one is a to-do', async () => {
  const id = await job();
  const [{ id: out }] = (await pool.query("insert into sms_outbox (site, job_id, kind, status) values ('ati-london', $1, 'booked', 'sent') returning id", [id])).rows;
  live();
  const path = `/api/quote?doc=sms-status&id=${out}`;
  const form = { MessageStatus: 'undelivered', ErrorCode: '30003', MessageSid: 'SM9' };
  const sig = (token) => createHmac('sha1', token).update('https://dampscan.co.uk' + path + Object.keys(form).sort().map((k) => k + form[k]).join('')).digest('base64');
  const call = async (signature) => { const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
    await quote({ method: 'POST', url: path, headers: { 'x-twilio-signature': signature, 'x-forwarded-for': '1.1.1.1' }, socket: {}, body: new URLSearchParams(form).toString() }, res); return res.statusCode; };
  assert.equal(await call(sig('wrong')), 403);
  assert.equal(await call(sig('tok')), 200);
  assert.equal((await rows())[0].delivery, 'undelivered');
  assert.equal((await pool.query('select count(*)::int as n from todos where job_id = $1', [id])).rows[0].n, 1);
});
