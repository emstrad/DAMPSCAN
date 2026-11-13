/**
 * The go-live edge cases (the owner's ask, 11 Nov 2026: every scenario, every
 * wire point), with a pretend Twilio and Revolut: a landline, the test
 * number, a cancellation inside the two minutes, an estate agent still
 * confirming, Twilio refusing, paying in full at once, the morning texts on a
 * late or repeated run, and a bank transfer by its reference.
 */
process.env.SMS_QUIET_HOURS = 'off';
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'golive-secret-long-enough-xxxxxxxxxxxx', IP_SALT: 'golive-salt', REVOLUT_MERCHANT_KEY: 'sk_test',
  SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_DAMPSCAN: 'DampScan', TWILIO_FROM_ATI: 'ATi Damp' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
let dbDown = 0;
const run = async (t, p) => { if (dbDown > 0 && /from jobs/.test(t)) { dbDown--; throw new Error('Error connecting to database: fetch failed'); } return (await pool.query(t, p)).rows; };
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: run, queryOne: async (t, p = []) => (await run(t, p))[0] || null, ping: async () => true } });

const orders = new Map();
let texts = [];
let twilioDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u.includes('api.twilio.com')) {
    if (twilioDown) return { ok: false, status: 400, json: async () => ({ message: 'Alphanumeric sender not approved' }) };
    const b = new URLSearchParams(o.body); texts.push({ to: b.get('To'), body: b.get('Body') }); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) };
  }
  if (u.endsWith('/api/orders') && o.method === 'POST') { const id = 'ord_' + (orders.size + 1); orders.set(id, { amount: JSON.parse(o.body).amount, state: 'completed' }); return { ok: true, json: async () => ({ id, checkout_url: 'https://checkout.revolut.com/' + id }) }; }
  const m = /\/api\/orders\/([^/]+)$/.exec(u);
  if (m && orders.has(m[1])) { const x = orders.get(m[1]); return { ok: true, json: async () => ({ id: m[1], state: x.state, amount: x.amount }) }; }
  throw new Error('unexpected call ' + u);
};

const { issuePortal, findPortal, portalView } = await import('../lib/portal.js');
const { startPayment, settleOrder } = await import('../lib/revolut-pay.js');
const { textBookedOrMoved, textsAfterChange, flushDue, morningTexts } = await import('../lib/texts.js');
const { reportSets } = await import('../lib/survey-money.js');
const { importRows } = await import('../lib/bank/import.js');
const { listBooks } = await import('../lib/bank/books.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, pay_orders, portal_events, bank_transactions, bank_statements restart identity cascade');
  texts = []; twilioDown = false; delete process.env.SMS_TEST_TO;
});
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const london = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function job(over = {}) {
  const o = { site: 'dampscan', phone: '07700 900123', date: day(6), time: '09:00', agent: false, ...over };
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor, awaiting_agent, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ($1, 'booked', 'Kim Lee', 'ME19 6AB', $2, 'full-house', 29500, true, $3, $4, 'ben', $5, 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [o.site, o.phone, o.date, o.time, o.agent])).rows[0].id);
}
const due = () => pool.query("update sms_outbox set send_after = now() where status = 'waiting'");
const outbox = async () => (await pool.query('select kind, status, error from sms_outbox order by id')).rows;
const todos = async () => (await pool.query('select text from todos order by id')).rows.map((r) => r.text);

test('a landline gets no text and the owners one to-do to call or email instead', async () => {
  const id = await job({ phone: '01732 123456' });
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.equal(texts.length, 0);
  assert.equal((await outbox())[0].status, 'failed');
  assert.match((await todos())[0], /^No mobile for Kim: they get no texts\. Email or call them instead\./);
});

test('with a test number set, every text goes to it and never to the customer', async () => {
  process.env.SMS_TEST_TO = '07700 900999';
  const id = await job();
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.deepEqual(texts.map((t) => t.to), ['+447700900999']);
});

test('cancelled inside the two minutes: the booked text never goes, and no cancellation text', async () => {
  const id = await job();
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await pool.query(`update jobs set status = 'cancelled' where id = $1`, [id]);
  await textsAfterChange(id, { delayMs: 0 });
  await due(); await flushDue();
  assert.equal(texts.length, 0);
  assert.deepEqual((await outbox()).map((r) => [r.kind, r.status]), [['booked', 'cancelled']]);
});

test('an estate agent still confirming: no booked text until they have, then it goes once', async () => {
  const id = await job({ agent: true });
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.equal(texts.length, 0, 'held while the agent confirms');
  assert.match((await outbox())[0].error, /^Waiting on the estate agent/);
  await pool.query('update jobs set awaiting_agent = false where id = $1', [id]);
  await textsAfterChange(id, { delayMs: 0 });
  await textsAfterChange(id, { delayMs: 0 });
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0].body, /^DampScan: Kim, booked /);
});

test('Twilio refusing a text makes a to-do, so nobody waits on a text that never went', async () => {
  twilioDown = true;
  const id = await job();
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due(); await flushDue();
  assert.equal((await outbox())[0].status, 'failed');
  assert.match((await todos())[0], /couldn't be sent \(Alphanumeric sender not approved\)/);
});

test('paid in full at once: one payment text, then the report text says ready to view', async () => {
  const id = await job();
  const token = new URL(await issuePortal(id)).searchParams.get('t');
  const j = (await findPortal(token)).job;
  const o = await startPayment(j, await portalView(j), 29500, { returnUrl: 'x' });
  await settleOrder(o.orderId);
  let v = await portalView((await findPortal(token)).job);
  assert.equal(v.state, 'booked');
  assert.equal(v.money.paidInFull, true);
  assert.equal(texts.length, 1);
  await pool.query(`update jobs set status = 'completed', job_date = current_date - 1, report_path = 'r/k.pdf' where id = $1`, [id]);
  const { sets, params } = reportSets({ ready: true });
  await pool.query(`update jobs set ${sets.join(', ')} where id = $1`, [id, ...params]);
  await textsAfterChange(id, { delayMs: 0 });
  await flushDue();
  v = await portalView((await findPortal(token)).job);
  assert.equal(v.state, 'report');
  assert.deepEqual((await outbox()).map((r) => r.kind), ['paid', 'ready_paid']);
  assert.match(texts[1].body, /report is ready to view/);
  assert.equal((await settleOrder(o.orderId)).already, true, 'Revolut telling us again changes nothing');
});

test('the morning text: once a day whichever kind, not once the visit has begun, not for an agent time', async () => {
  const later = await job({ date: london(), time: '23:59' });
  await job({ date: london(), time: '00:01' });
  await job({ date: london(), time: '23:58', agent: true });
  assert.equal(await morningTexts(), 1, 'only the visit still to come, with its time agreed');
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [later]);
  assert.equal(await morningTexts(), 0, 'a later run, deposit now paid: still the one text');
  await flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0].body, /Deposit £147\.50/);
});

test('a bank transfer with the page\'s reference: matched, on their page, texted at once', async () => {
  const id = await job();
  const ref = `KIM${String(id).padStart(4, '0')}`;
  const all = await pool.query('select slug from businesses');
  const books = (await listBooks({ isAdmin: true, businesses: all.rows.map((r) => r.slug) })).find((b) => b.sites.includes('dampscan'));
  assert.ok(books, 'the damp books');
  await importRows({ rows: [{ externalId: 'tx1', postedOn: london(), type: 'TRANSFER', description: 'Payment from K LEE', reference: ref, counterparty: 'K LEE', currency: 'GBP', amountPence: 14750, feePence: 0, balancePence: null, account: 'acc' }] }, 'Revolut feed', books);
  const token = new URL(await issuePortal(id)).searchParams.get('t');
  const v = await portalView((await findPortal(token)).job);
  assert.equal(v.money.paidPence, 14750);
  assert.equal(v.state, 'booked');
  await flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0].body, /received £147\.50/);
});

test('the database out for a moment: the text waits and goes on the next try, never lost', async () => {
  const id = await job();
  await textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await due();
  dbDown = 1;
  await flushDue();
  assert.equal(texts.length, 0);
  assert.deepEqual((await outbox()).map((r) => [r.status, /^Trying again/.test(r.error || '')]), [['waiting', true]]);
  await due(); await flushDue();
  assert.equal(texts.length, 1);
  assert.equal((await outbox())[0].status, 'sent');
});
