/**
 * The text rules (the owner's ask, 13 Nov 2026): the wording that fits each
 * situation, the half-finished form's "can we help?", the reminders, and the
 * texts that must not go twice or clash, with a pretend Twilio.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'rules-secret-long-enough-xxxxxxxxxxxxx', IP_SALT: 'rules-salt', SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM_DAMPSCAN: 'DampScan', TWILIO_FROM_ATI: 'ATi Damp' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

let texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (!String(url).includes('api.twilio.com')) throw new Error('unexpected call ' + url);
  const b = new URLSearchParams(o.body); texts.push({ to: b.get('To'), body: b.get('Body') }); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) };
};

const { queueText, textBookedOrMoved, flushDue, morningTexts } = await import('../lib/texts.js');
const { queuePartial, queueReminders } = await import('../lib/text-nudges.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, estate_agents restart identity cascade'); texts = []; });
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const due = () => pool.query("update sms_outbox set send_after = now() where status = 'waiting'");
const outbox = async () => (await pool.query('select kind, status, error from sms_outbox order by id')).rows;
const lead = async (o = {}) => Number((await pool.query(`insert into leads (site, stage, first_name, email, postcode, phone, session_id, updated_at)
  values ('dampscan', $1, 'Kim', $2, 'ME19 6AB', $3, coalesce($4::uuid, gen_random_uuid()), now() - make_interval(mins => $5)) returning id`,
  [o.stage || 'partial', o.email || 'k@x.com', o.phone || '07700900123', o.session || null, o.idle == null ? 15 : o.idle])).rows[0].id);
async function job(o = {}) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor,
      estate_agent_id, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '07700 900123', 'full-house', 29500, true, $1, $2, 'ben', $3, 0, 0, '', '', '', 0, 0, 0, 5000) returning id`,
  [o.date || day(6), o.time || '09:00', o.agent || null])).rows[0].id);
}

test('a half-finished form: a polite "can we help?" ten minutes after they stop, never while typing, never once finished, once a month', async () => {
  const typing = await lead({ idle: 2 });
  await queuePartial('dampscan', typing);
  await due(); await flushDue();
  assert.equal(texts.length, 0, 'still filling it in');
  assert.equal((await outbox())[0].status, 'waiting');
  await pool.query("update leads set updated_at = now() - interval '12 minutes'");
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0].body, /^Hi Kim, it's DampScan\. We noticed you didn't quite get to the end of our booking form, no problem at all\. Is there anything we can help with\? Just call us on 07386 225526, or finish it here whenever suits: https:\/\/dampscan\.co\.uk\/#book$/);
  const again = await lead({ session: '00000000-0000-4000-8000-000000000001' });
  await queuePartial('dampscan', again);
  await due(); await flushDue();
  assert.equal(texts.length, 1, 'once a month per number');
  const done = await lead({ phone: '07700900555', email: 'd@x.com', session: '00000000-0000-4000-8000-000000000002' });
  await lead({ stage: 'complete', phone: '07700900555', email: 'd@x.com', session: '00000000-0000-4000-8000-000000000002' });
  await queuePartial('dampscan', done);
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.match((await outbox()).at(-1).error, /^They finished the form/);
});

test('the estate agent letting us in: "we\'ve confirmed it with your estate agent", and the morning says so', async () => {
  const a = Number((await pool.query("insert into estate_agents (name) values ('Agent') returning id")).rows[0].id);
  const id = await job({ agent: a });
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.match(texts[0].body, /^Hi Kim, we've confirmed your DampScan survey with your estate agent: .+, arriving 9 to 10am\. They'll let Ben in, so you don't need to be there unless you'd like to\. To secure it, please pay the £147\.50 deposit on your page: https:\/\/dampscan\.co\.uk\/m\//);
  const today = await job({ agent: a, date: day(0), time: '23:59' });
  assert.equal(await morningTexts(), 1);
  await flushDue();
  assert.match(texts[1].body, /your estate agent is letting them in\. Your £147\.50 deposit is still to pay/);
  assert.ok(today);
});

test('moved to the time they asked for on their page says "as you asked"; tomorrow reads as tomorrow', async () => {
  const id = await job({ date: day(1), time: '14:00' });
  await pool.query(`update jobs set move_request = $2::jsonb where id = $1`, [id, JSON.stringify({ date: day(1), time: '14:00', from: `${day(6)} 09:00` })]);
  await textBookedOrMoved(id, { first: false, date: day(1), time: '14:00' });
  await due(); await flushDue();
  assert.match(texts[0].body, /^Hi Kim, all done! As you asked, your DampScan survey is now tomorrow, arriving 2 to 3pm\./);
});

test('booked today: no morning text on top of the booked one', async () => {
  const id = await job({ date: day(0), time: '23:58' });
  await textBookedOrMoved(id, { first: true, date: day(0), time: '23:58' });
  await due(); await flushDue();
  assert.match(texts[0].body, /booked in with DampScan for today/);
  assert.equal(await morningTexts(), 0);
});

test('reminders: the deposit once after two days, the balance once after three, daytime only, never once paid', async () => {
  const id = await job({ date: day(6) });
  await queueText({ kind: 'booked', site: 'dampscan', jobId: id, key: 'b' });
  await due(); await flushDue();
  await pool.query("update jobs set booked_at = now() - interval '3 days' where id = $1", [id]);
  assert.equal(await queueReminders({ hour: 8 }), 0, 'not before 10am');
  assert.equal(await queueReminders({ hour: 11 }), 1);
  assert.equal(await queueReminders({ hour: 12 }), 0, 'once');
  await flushDue();
  assert.match(texts[1].body, /^Hi Kim, a friendly reminder from DampScan: your survey \(.+, 9 to 10am\) is booked in, but the £147\.50 deposit is still to pay\./);
  await pool.query("update jobs set status = 'completed', job_date = current_date - 5, report_ready_at = now() - interval '4 days', deposit_paid_at = now() where id = $1", [id]);
  await pool.query("insert into sms_outbox (site, job_id, kind, dedupe, status, sent_at) values ('dampscan', $1, 'ready', 'ready', 'sent', now() - interval '4 days')", [id]);
  assert.equal(await queueReminders({ hour: 11 }), 1);
  await pool.query('update jobs set paid_at = now() where id = $1', [id]);
  await flushDue();
  assert.equal(texts.length, 2, 'paid meanwhile: the reminder never goes');
  assert.match((await outbox()).at(-1).error, /^Paid, held or no longer ready/);
});

test('a move undone back to the time they were told texts nothing; Report ready undone stops the "ready to view" text', async () => {
  const id = await job({ date: day(6), time: '09:00' });
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  await textBookedOrMoved(id, { first: false, date: day(7), time: '10:00' });
  await textBookedOrMoved(id, { first: false, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.equal(texts.length, 1, 'back where they were told: nothing to say');
  await pool.query("update jobs set status = 'completed', job_date = current_date - 1, paid_at = now(), report_path = 'r/k.pdf', report_ready_at = now() where id = $1", [id]);
  const { textsAfterChange } = await import('../lib/texts.js');
  await textsAfterChange(id, { delayMs: 0 });
  await pool.query('update jobs set report_ready_at = null where id = $1', [id]);
  await flushDue();
  assert.equal(texts.length, 1, 'undone in time: never sent');
  assert.match((await outbox()).at(-1).error, /no longer marked ready/);
});

test('the texts sit in the customer\'s history with their words', async () => {
  const { correspondence } = await import('../lib/correspondence.js');
  const id = await job();
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  const e = (await correspondence('job', id)).find((x) => x.kind === 'sms');
  assert.equal(e.subject, 'Booked, deposit due');
  assert.equal(e.state, 'sent');
  assert.match(e.body, /^Hi Kim, you're booked in with DampScan/);
});
