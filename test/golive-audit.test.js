/**
 * Each fix from the go-live audit (11 Nov 2026) held in place: the report text
 * after a late balance, Stop that sticks, rebooking, one text for two quick
 * changes, quiet hours, receipts that never step back, the agent's number,
 * and on the money side a card payment never matched twice from the bank, a
 * price rise after paying, card and bank adding up, a payment still going
 * through, a lost notice found again, an emailed report, and no paying for a
 * cancelled survey.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'audit-secret-long-enough-xxxxxxxxxxxxx', IP_SALT: 'audit-salt', REVOLUT_MERCHANT_KEY: 'sk_test', SMS_QUIET_HOURS: 'off',
  SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_DAMPSCAN: 'DampScan' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const orders = new Map();
let texts = [];
let revolutDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u.includes('api.twilio.com')) { texts.push(new URLSearchParams(o.body).get('Body')); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) }; }
  if (revolutDown) throw new Error('fetch failed');
  if (u.endsWith('/api/orders') && o.method === 'POST') { const id = 'ord_' + (orders.size + 1); orders.set(id, { amount: JSON.parse(o.body).amount, state: 'pending' }); return { ok: true, json: async () => ({ id, checkout_url: 'https://checkout.revolut.com/' + id }) }; }
  const m = /\/api\/orders\/([^/]+)$/.exec(u);
  if (m && orders.has(m[1])) { const x = orders.get(m[1]); return { ok: true, json: async () => ({ id: m[1], state: x.state, amount: x.amount }) }; }
  throw new Error('unexpected call ' + u);
};

const { issuePortal, findPortal, portalView } = await import('../lib/portal.js');
const R = await import('../lib/revolut-pay.js');
const T = await import('../lib/texts.js');
const { reportSets } = await import('../lib/survey-money.js');
const { importRows } = await import('../lib/bank/import.js');
const { listBooks } = await import('../lib/bank/books.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, pay_orders, portal_events, bank_transactions, bank_statements, estate_agents restart identity cascade');
  texts = []; revolutDown = false; orders.clear();
});
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const london = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
async function job(extra = '') {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '07700 900123', 'full-house', 29500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [day(6)])).rows[0].id);
  if (extra) await pool.query(`update jobs set ${extra} where id = $1`, [id]);
  return id;
}
const view = async (id) => { const t = new URL(await issuePortal(id)).searchParams.get('t'); return portalView((await findPortal(t)).job); };
const kinds = async () => (await pool.query('select kind, status from sms_outbox order by id')).rows.map((r) => `${r.kind}:${r.status}`);
const ready = async (id) => { const { sets, params } = reportSets({ ready: true }); await pool.query(`update jobs set ${sets.join(', ')} where id = $1`, [id, ...params]); };
const due = () => pool.query("update sms_outbox set send_after = now() where status = 'waiting'");

test('the report text goes when the balance comes days after the report was made ready', async () => {
  const id = await job(`status = 'completed', job_date = current_date - 6, deposit_paid_at = now() - interval '6 days', report_path = 'r.pdf'`);
  await ready(id);
  await T.textsAfterChange(id, { delayMs: 0 });
  await T.flushDue();
  await pool.query(`update jobs set report_ready_at = now() - interval '5 days' where id = $1`, [id]);
  await pool.query(`insert into job_payments (job_id, amount_pence, label) values ($1, 29500, 'balance')`, [id]);
  await T.textsAfterChange(id, { delayMs: 0 });
  await T.flushDue();
  assert.deepEqual(await kinds(), ['ready:sent', 'report:sent']);
});

test('a text stopped on the Texts page stays stopped whatever is edited after', async () => {
  const id = await job(`status = 'completed', job_date = current_date - 1, report_path = 'r.pdf'`);
  await ready(id);
  await T.textsAfterChange(id);
  await pool.query(`update sms_outbox set status = 'cancelled', error = 'Stopped by Scott.'`);
  await T.textsAfterChange(id);
  await T.textsAfterChange(id);
  assert.deepEqual(await kinds(), ['ready:cancelled']);
});

test('rebooked after Unbook gets a booked text; booked then moved quickly is one text with the new time', async () => {
  const id = await job();
  await T.textBookedOrMoved(id, { first: true, date: day(6), time: '09:00' });
  await T.textBookedOrMoved(id, { first: false, date: day(7), time: '10:00' });
  await pool.query(`update jobs set job_date = $2, job_time = '10:00' where id = $1`, [id, day(7)]);
  await due(); await T.flushDue();
  assert.equal(texts.length, 1);
  assert.match(texts[0], /10 to 11am/);
  await new Promise((r) => setTimeout(r, 1100));
  await pool.query(`update sms_outbox set dedupe = dedupe || ' first'`);
  await T.textBookedOrMoved(id, { first: true, date: day(7), time: '10:00' });
  await due(); await T.flushDue();
  assert.equal(texts.length, 2, 'the rebooking is texted too');
});

test('report sent then report ready is one text; a time already past today is never texted as booked', async () => {
  const id = await job(`status = 'completed', job_date = current_date - 1, report_path = 'r.pdf', survey_sent_at = now()`);
  await T.textsAfterChange(id, { delayMs: 0 });
  await ready(id);
  await T.textsAfterChange(id, { delayMs: 0 });
  assert.deepEqual(await kinds(), ['ready:waiting']);
  const early = await job();
  await T.textBookedOrMoved(early, { first: true, date: london(), time: '00:00' });
  assert.equal((await pool.query('select count(*)::int as n from sms_outbox where job_id = $1', [early])).rows[0].n, 0);
});

test('quiet hours hold texts overnight; a late "sent" receipt never undoes "delivered"', async () => {
  const id = await job();
  await T.queueText({ kind: 'booked', site: 'dampscan', jobId: id, key: 'b' });
  delete process.env.SMS_QUIET_HOURS;
  assert.equal(await T.flushDue({ now: new Date('2026-11-12T23:30:00Z') }), 0, 'held at half eleven at night');
  process.env.SMS_QUIET_HOURS = 'off';
  await T.flushDue();
  const row = (await pool.query('select id from sms_outbox')).rows[0];
  await T.deliveryReceipt(row.id, 'delivered');
  await T.deliveryReceipt(row.id, 'sent');
  assert.equal((await pool.query('select delivery from sms_outbox')).rows[0].delivery, 'delivered');
});

test('the estate agent\'s own number on the job is never texted', async () => {
  const agent = Number((await pool.query(`insert into estate_agents (name, phone) values ('Home Sales', '07700 900123') returning id`)).rows[0].id);
  const id = await job(`estate_agent_id = ${agent}`);
  await T.queueText({ kind: 'booked', site: 'dampscan', jobId: id, key: 'b' });
  await T.flushDue();
  assert.equal(texts.length, 0);
  assert.match((await pool.query('select error from sms_outbox')).rows[0].error, /estate agent/);
});

test('Revolut paying in a card payment is never matched to the survey again', async () => {
  const id = await job();
  await pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, 14750, 'deposit', 'revolut:ord_x')`, [id]);
  const all = await pool.query('select slug from businesses');
  const books = (await listBooks({ isAdmin: true, businesses: all.rows.map((r) => r.slug) })).find((b) => b.sites.includes('dampscan'));
  const ref = `KIM${String(id).padStart(4, '0')}`;
  await importRows({ rows: [
    { externalId: 'm1', postedOn: london(), type: 'CARD_CREDIT', description: `Full House, ${ref}`, reference: ref, counterparty: 'Kim Lee', currency: 'GBP', amountPence: 14750, feePence: 0, account: 'a' },
    { externalId: 'm2', postedOn: london(), type: 'TRANSFER', description: `Revolut payout ${ref}`, reference: ref, counterparty: 'Revolut', currency: 'GBP', amountPence: 14530, feePence: 0, account: 'a' }
  ] }, 'Revolut feed', books);
  assert.equal((await pool.query('select count(*)::int as n from bank_transactions where job_id is not null')).rows[0].n, 0);
  assert.equal((await view(id)).money.paidPence, 14750);
});

test('a price rise after paying asks for the difference; card and bank add up to paid in full', async () => {
  const id = await job(`paid_at = now()`);
  await pool.query(`update jobs set survey_price_pence = 37500 where id = $1`, [id]);
  let v = await view(id);
  assert.equal(v.money.paidInFull, false);
  assert.equal(v.money.balancePence, 8000);
  const both = await job();
  await pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref) values ($1, 14750, 'deposit', 'revolut:o1')`, [both]);
  const all = await pool.query('select slug from businesses');
  const books = (await listBooks({ isAdmin: true, businesses: all.rows.map((r) => r.slug) })).find((b) => b.sites.includes('dampscan'));
  await importRows({ rows: [{ externalId: 't9', postedOn: london(), type: 'TRANSFER', description: 'K LEE', reference: `KIM${String(both).padStart(4, '0')}`, counterparty: 'K LEE', currency: 'GBP', amountPence: 14750, feePence: 0, account: 'a' }] }, 'Revolut feed', books);
  v = await view(both);
  assert.equal(v.money.paidInFull, true);
  assert.ok((await pool.query('select paid_at from jobs where id = $1', [both])).rows[0].paid_at, 'paid in full ticked from card and bank together');
});

test('a payment still going through keeps confirming; a lost notice is found by the hourly sweep', async () => {
  const id = await job();
  const v = await view(id);
  const j = (await findPortal(new URL(await issuePortal(id)).searchParams.get('t'))).job;
  const o = await R.startPayment(j, v, 14750, { returnUrl: 'x' });
  orders.get(o.orderId).state = 'processing';
  assert.equal((await R.latestOrder(id)).state, 'pending');
  revolutDown = true;
  assert.equal((await R.onWebhook({ order_id: o.orderId })).status, 500, 'Revolut is asked to send it again');
  revolutDown = false;
  orders.get(o.orderId).state = 'completed';
  assert.deepEqual(await R.sweepOrders(), { checked: 1, recorded: 1 });
  assert.equal((await view(id)).money.paidPence, 14750);
});

test('an emailed report with no file: paid in full is done, not "pay £0"; a cancelled survey cannot be paid', async () => {
  const id = await job(`status = 'completed', job_date = current_date - 1, paid_at = now(), survey_sent_at = now()`);
  const v = await view(id);
  assert.equal(v.state, 'report');
  assert.equal(v.report.file, false);
  const gone = await job(`status = 'cancelled'`);
  const g = (await findPortal(new URL(await issuePortal(gone)).searchParams.get('t'))).job;
  assert.deepEqual(await R.startPayment(g, await view(gone), 14750, { returnUrl: 'x' }), { error: 'not_now' });
});
