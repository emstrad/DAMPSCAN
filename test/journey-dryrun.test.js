/**
 * A dry run of one customer, start to finish, with a pretend Revolut and a
 * pretend Twilio (the owners' go-live check, 11 Nov 2026): booked, the
 * deposit paid online, surveyed, report ready, the balance paid, the report
 * unlocked. At each step the page shows the right state, the right text is
 * sent once in the right words, and the receipts add up.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'dryrun-secret-long-enough-xxxxxxxxxxxx', IP_SALT: 'dryrun-salt', REVOLUT_MERCHANT_KEY: 'sk_test',
  SMS_AUTO: 'on', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_DAMPSCAN: 'DampScan' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

/* The pretend outside world: Revolut orders and Twilio messages. */
const orders = new Map();
const texts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u.includes('api.twilio.com')) { const b = new URLSearchParams(o.body); texts.push({ to: b.get('To'), from: b.get('From'), body: b.get('Body') }); return { ok: true, json: async () => ({ sid: 'SM' + texts.length }) }; }
  if (u.endsWith('/api/orders') && o.method === 'POST') { const id = 'ord_' + (orders.size + 1); orders.set(id, { amount: JSON.parse(o.body).amount, state: 'pending' }); return { ok: true, json: async () => ({ id, checkout_url: 'https://checkout.revolut.com/' + id }) }; }
  const m = /\/api\/orders\/([^/]+)$/.exec(u);
  if (m && orders.has(m[1])) { const x = orders.get(m[1]); return { ok: true, json: async () => ({ id: m[1], state: x.state, amount: x.amount }) }; }
  throw new Error('unexpected call ' + u);
};

const { issuePortal, findPortal, portalView } = await import('../lib/portal.js');
const { startPayment, settleOrder } = await import('../lib/revolut-pay.js');
const { textBookedOrMoved, textsAfterChange, flushDue } = await import('../lib/texts.js');
const { reportSets } = await import('../lib/survey-money.js');

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, pay_orders, portal_events, company_details restart identity cascade');
});
after(async () => { await pool.end(); globalThis.fetch = realFetch; });

const DAY = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
let id, token;
const page = async () => portalView((await findPortal(token)).job);
const sent = () => texts.map((t) => t.body);
async function pay(pence) {
  const j = (await findPortal(token)).job;
  const v = await page();
  const out = await startPayment(j, v, pence, { returnUrl: 'https://dampscan.co.uk/my.html?paid=1' });
  assert.ok(out.url, JSON.stringify(out));
  orders.get(out.orderId).state = 'completed';
  assert.ok((await settleOrder(out.orderId)).recorded);
}

test('one customer, start to finish', async () => {
  id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_address, customer_phone, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '4 Mill Lane, West Malling', '07700 900123', 'full-house', 29500, true, $1, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`, [DAY])).rows[0].id);
  token = new URL(await issuePortal(id)).searchParams.get('t');

  /* Booked: text 2 with the deposit and the link to their page. */
  await textBookedOrMoved(id, { first: true, date: DAY, time: '09:00' });
  await pool.query("update sms_outbox set send_after = now() where status = 'waiting'");
  await flushDue({ limit: 10 });
  assert.equal(texts.length, 1);
  assert.equal(texts[0].from, 'DampScan');
  assert.equal(texts[0].to, '+447700900123');
  assert.match(texts[0].body, /^DampScan: Kim, booked .* Deposit £147\.50: https:\/\/dampscan\.co\.uk\/m\/[\w-]{32} Call 07386 225526$/);
  for (const t of texts) assert.ok(t.body.length <= 160, 'one text: ' + t.body);
  assert.equal((await page()).state, 'deposit');

  /* The deposit online: recorded once, ticked, text 3 straight away, a receipt. */
  await pay(14750);
  let v = await page();
  assert.equal(v.state, 'booked');
  assert.equal(v.money.paidPence, 14750);
  assert.equal(v.receipts.items.length, 1);
  assert.equal(texts.length, 2);
  assert.match(texts[1].body, /£147\.50/);

  /* Surveyed, report written and made ready: text 5 asks for the balance; the report stays locked. */
  await pool.query(`update jobs set status = 'completed', job_date = current_date - 1, report_path = 'r/kim.pdf', report_name = 'Kim.pdf' where id = $1`, [id]);
  assert.equal((await page()).state, 'writing');
  const { sets, params } = reportSets({ ready: true });
  await pool.query(`update jobs set ${sets.join(', ')} where id = $1`, [id, ...params]);
  await textsAfterChange(id, { delayMs: 0 });
  await flushDue({ limit: 10 });
  v = await page();
  assert.equal(v.state, 'ready');
  assert.equal(v.report.unlocked, false);
  assert.equal(texts.length, 3);
  assert.match(texts[2].body, /£147\.50/, 'the balance asked for');

  /* The balance online: paid in full, the report unlocked, text 6, two receipts. */
  await pay(14750);
  v = await page();
  assert.equal(v.state, 'report');
  assert.equal(v.report.unlocked, true);
  assert.equal(v.money.paidInFull, true);
  assert.equal(v.receipts.items.length, 2);
  await flushDue({ limit: 10 });
  assert.equal(texts.length, 4, sent().join(' | '));

  /* Every text once, nothing left unfilled, each with our number, none to an agent. */
  for (const b of sent()) {
    assert.ok(!/[{}]/.test(b), 'no unfilled word: ' + b);
    assert.ok(b.length <= 160, 'one text: ' + b);
    assert.match(b, /07386 225526/, 'our number, since they cannot reply');
    assert.ok(!/—/.test(b), 'no em dash');
  }
  const kinds = (await pool.query("select kind, status from sms_outbox order by id")).rows.map((r) => `${r.kind}:${r.status}`);
  assert.deepEqual(kinds, ['booked:sent', 'paid:sent', 'ready:sent', 'report:sent']);
  /* What the owners were told: one alert per payment. */
  assert.equal((await pool.query("select count(*)::int as n from notifications where kind = 'payment'")).rows[0].n, 2);
});
