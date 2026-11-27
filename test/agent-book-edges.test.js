/**
 * Quick book's edge cases (the owner, 27 Nov 2026): the tenant or seller
 * letting us in never reads as "confirmed with your estate agent"; the same
 * buyer at the same property is never booked twice; a buyer with no mobile of
 * their own is not promised a text, and the agency's number is never texted;
 * "ATi Damp Survey survey" reads once; names typed in a hurry are tidied; a
 * time left with us is said as the agent's; and a day after the visit the card
 * offers "Book another visit here" with the property filled in.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'agent-edges-secret-long-enough-xxxxxxxx', SMS_QUIET_HOURS: 'off' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: 'true' }), text: async () => '' });
const P = await import('../lib/agent-portal.js');
const B = await import('../lib/agent-book.js');
const { jobKind } = await import('../lib/text-pick.js');
const { render } = await import('../lib/text-words.js');
const { queueText, flushDue } = await import('../lib/texts.js');
const { recordOutcome } = await import('../lib/form-outcome.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, estate_agents, notifications, sms_outbox restart identity cascade'); });
after(async () => { await pool.end(); });

async function me() {
  const id = Number((await pool.query(`insert into estate_agents (name, phone, site) values ('CA Services', '020 8740 0000', 'ati-london') returning id`)).rows[0].id);
  return P.agentByToken((await P.agentPageFor(id)).split('/a/')[1]);
}
const SAM = { address: '12 Askew Road', town: 'London', postcode: 'w12 9ne', name: 'sam patel', phone: '07700 900456', email: 'Sam@example.com', access: 'agent' };
/* What booking the enquiry makes: a survey on it, dated days from today. */
const bookIt = async (leadId, days) => Number((await pool.query(`insert into jobs (site, status, lead_id, customer_name, customer_postcode, customer_phone, customer_email, customer_address,
    survey_type, survey_price_pence, surveyor, date_set, job_date, job_time, estate_agent_id, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  select site, 'booked', id, first_name, postcode, phone, email, concat_ws(', ', address_line1, town), 'full-house', 29500, 'tom', true, current_date + $2::int, '10:00', estate_agent_id, 2000, 0, 'scott', 'tom', 'ben'
    from leads where id = $1 returning id`, [leadId, days])).rows[0].id);

test('the tenant or seller letting us in is never "confirmed with your estate agent"', () => {
  const m = { depositPaid: false };
  assert.equal(jobKind('booked', { estate_agent_id: 5 }, m), 'booked_agent', 'an agent on the card, nothing said: the old meaning');
  assert.equal(jobKind('booked', { estate_agent_id: 5, agent_access: 'tenant' }, m), 'booked');
  assert.equal(jobKind('moved', { estate_agent_id: 5, agent_access: 'vendor' }, m), 'moved');
  assert.equal(jobKind('booked', { estate_agent_id: null, agent_access: 'agent' }, m), 'booked_agent');
});

test('the same buyer at the same property is shown their survey, never booked twice; a visit already done never blocks', async () => {
  const a = await me();
  const first = await B.quickBook(a, SAM);
  const job = await bookIt(first.leadId, 3);
  const again = await B.quickBook(a, { ...SAM, name: 'Sam Patel', email: 'other@example.com' });
  assert.equal(again.already.id, job, 'the same mobile at the same postcode');
  assert.match(again.already.said, /at 10:00$/);
  assert.equal(Number((await pool.query('select count(*) from leads')).rows[0].count), 1, 'no second enquiry, alert or text');
  await pool.query('update jobs set job_date = current_date - 3 where id = $1', [job]);
  assert.ok((await B.quickBook(a, SAM)).leadId, 'visited: a new visit is allowed');
});

test('names are tidied, and a buyer with only a landline or the agency\'s number is not promised a text', async () => {
  const a = await me();
  assert.equal(B.nameCase('sam patel'), 'Sam Patel');
  assert.equal(B.nameCase('MR D. MCNIVEN'), 'Mr D. Mcniven');
  assert.equal(B.nameCase('Ms D. McNiven'), 'Ms D. McNiven', 'their own capitals kept');
  const out = await B.quickBook(a, SAM);
  assert.equal((await pool.query('select first_name from leads where id = $1', [out.leadId])).rows[0].first_name, 'Sam Patel');
  assert.equal(out.texts, true);
  assert.equal((await B.quickBook(a, { ...SAM, postcode: 'W12 8QT', phone: '02087400000', email: 'a@example.com' })).texts, false, 'the agency\'s own number');
  assert.equal((await B.quickBook(a, { ...SAM, postcode: 'W12 7AA', phone: '01732 123456', email: 'b@example.com' })).texts, false, 'a landline');
});

test('the agency\'s number is never texted, even when the tenant lets us in', async () => {
  const a = await me();
  const out = await B.quickBook(a, { ...SAM, phone: '0208 740 0000', access: 'tenant', contact: 'Mrs Iris Meadows 07834 550536' });
  const job = await bookIt(out.leadId, 3);
  assert.equal((await pool.query('select estate_agent_id from jobs where id = $1', [job])).rows[0].estate_agent_id, null);
  await queueText({ kind: 'booked', site: 'ati-london', jobId: job, key: 'b' });
  await flushDue({ limit: 5 });
  const row = (await pool.query(`select status, error from sms_outbox where kind = 'booked'`)).rows[0];
  assert.deepEqual([row.status, /estate agent/.test(row.error)], ['cancelled', true]);
});

test('"ATi Damp Survey survey" reads once, in every wording', () => {
  assert.equal(render('Your {brand} survey report is ready', { brand: 'ATi Damp Survey' }), 'Your ATi Damp Survey report is ready');
  assert.equal(render('your {brand} survey', { brand: 'DampScan' }), 'your DampScan survey');
});

test('a time left with us on the agent\'s page is said as the agent\'s, straight away', async () => {
  const a = await me();
  const out = await B.quickBook(a, SAM);
  await recordOutcome(out.leadId, 'call', { sessionId: out.sessionId });
  const n = (await pool.query(`select title, message from notifications where title like 'Arrange a time%'`)).rows[0];
  assert.match(n.message, /^CA Services left the time with us for Sam/);
  const log = (await pool.query('select sched_log from leads where id = $1', [out.leadId])).rows[0].sched_log;
  assert.ok(log.some((e) => /CA Services left the time with us on their agent page/.test(e.note)));
});

test('a day after the visit the card offers another visit here, the property filled in', async () => {
  const a = await me();
  const done = await bookIt((await B.quickBook(a, SAM)).leadId, -3);
  const ahead = await bookIt((await B.quickBook(a, { ...SAM, postcode: 'W12 8QT', address: '3 Bloemfontein Road' })).leadId, 3);
  const all = (await P.agentView(a)).current.concat((await P.agentView(a)).finished);
  assert.deepEqual(all.find((s) => s.id === done).rebook, { address: '12 Askew Road', town: 'London', postcode: 'W12 9NE' });
  assert.equal(all.find((s) => s.id === ahead).rebook, null, 'not before the visit');
  await pool.query(`update jobs set status = 'cancelled' where id = $1`, [done]);
  assert.equal((await P.agentView(a)).current.concat((await P.agentView(a)).finished).find((s) => s.id === done)?.rebook ?? null, null, 'nor once cancelled');
});
