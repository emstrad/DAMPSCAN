/**
 * Company details in Settings (never a password), receipts on the
 * customer's page in their name with the company's details, Revolut's fee
 * kept when it says, and the ChatGPT tools for a customer's page and the
 * company (the owners' plan, 11 Nov 2026).
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'company-secret-long-enough-xxxxxxxxxxx';
process.env.IP_SALT = 'company-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const C = await import('../lib/company-details.js');
const { issuePortal, findPortal, portalView } = await import('../lib/portal.js');
const { feeOf } = await import('../lib/revolut-pay.js');
const { PAGE_TOOLS } = await import('../lib/mcp/page-tools.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, company_details, portal_events restart identity cascade'); });
after(async () => { await pool.end(); });

test('company details keep facts, never passwords or PINs', async () => {
  const saved = await C.saveCompany({ company_number: '12345678', gateway_user_id: '1234 5678 9012', made_up: 'x' }, 'Scott');
  const v = Object.fromEntries(saved.fields.map((f) => [f.key, f.value]));
  assert.equal(v.company_number, '12345678');
  assert.equal(v.gateway_user_id, '1234 5678 9012');
  assert.equal(v.legal_name, 'Damp Surveying Limited');
  assert.ok(!('made_up' in v), 'only the fixed fields');
  for (const secret of ['Password: hunter2', 'PIN 1234', 'security answer is Rex', 'passcode=9911']) {
    const out = await C.saveCompany({ notes: secret }, 'Scott');
    assert.ok(out.errors && out.errors.notes, secret);
  }
  assert.equal((await pool.query("select count(*)::int as n from company_details where key = 'notes'")).rows[0].n, 0);
  await C.saveCompany({ company_number: '' }, 'Scott');
  assert.equal((await pool.query("select count(*)::int as n from company_details where key = 'company_number'")).rows[0].n, 0, 'emptied is removed');
});

test('a receipt for each payment, in their name for the property, from the company', async () => {
  await C.saveCompany({ company_number: '12345678', registered_office: '1 High St, West Malling' }, 'Scott');
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_address, survey_price_pence, date_set, job_date, job_time, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', '4 Mill Lane', 29500, true, current_date + 5, '09:00', 'ben', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`)).rows[0].id);
  await pool.query(`insert into job_payments (job_id, amount_pence, label, external_ref, paid_on) values ($1, 14750, 'deposit', 'revolut:ord_1', '2026-11-10')`, [id]);
  const token = new URL(await issuePortal(id)).searchParams.get('t');
  const v = await portalView((await findPortal(token)).job);
  assert.deepEqual(v.receipts.company, { name: 'Damp Surveying Limited', number: '12345678', office: '1 High St, West Malling', vatNumber: null });
  assert.deepEqual(v.receipts.to, { name: 'Kim Lee', address: '4 Mill Lane, ME19 6AB' });
  assert.deepEqual(v.receipts.items.map((r) => [r.day, r.pence, r.how, r.refund]), [['2026-11-10', 14750, 'Card or wallet, online', false]]);
  assert.match(v.receipts.items[0].number, new RegExp(`^R-${id}-P\\d+$`));
});

test('Revolut\'s fee is kept when its answer carries one', () => {
  assert.equal(feeOf({ payments: [{ fees: [{ type: 'acquiring', amount: 123 }, { type: 'fx', amount: 7 }] }] }), 130);
  assert.equal(feeOf({ payments: [{}] }), null);
  assert.equal(feeOf({}), null);
});

test('company details in ChatGPT are for the owners only', async () => {
  const tool = PAGE_TOOLS.find((t) => t.name === 'company_details');
  const manager = await tool.run({ isAdmin: false, businesses: ['dampscan'], levels: { dampscan: 'manage' } }, {});
  assert.equal(manager.data.ok, false);
  await C.saveCompany({ company_number: '12345678' }, 'Scott');
  const owner = await tool.run({ isAdmin: true, businesses: ['dampscan'], levels: {} }, {});
  assert.equal(owner.data.company['Company number'], '12345678');
});
