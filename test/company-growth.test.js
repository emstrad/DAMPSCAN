/**
 * Company, Growth (the owners' plan, 15 Nov 2026): Google Ads spend against
 * what its paid clicks became, the funnel by month and every source.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const G = await import('../lib/company-growth.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, events, expenses restart identity cascade'); });
after(async () => { await pool.end(); });

async function enquiry(channel, { gclid = null, booked = false, paid = false, phone = false } = {}) {
  const sid = randomUUID();
  await pool.query("insert into events (session_id, type, channel, site) values ($1, 'page_view', $2, 'ati-london')", [sid, channel]);
  const lead = (await pool.query(`insert into leads (session_id, stage, site, first_name, email, postcode, source_path, utm) values ($1, 'complete', 'ati-london', 'Kim', 'kim@example.com', 'SE18 3AB', $2, $3) returning id`,
    [sid, phone ? 'phone' : '/', gclid ? JSON.stringify({ gclid }) : null])).rows[0].id;
  if (booked) {
    await pool.query(`insert into jobs (site, status, customer_name, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, paid_at, lead_id, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
      values ('ati-london', 'booked', 'Kim Lee', 'full-house', 29500, 'tom', 10000, true, current_date, '10:00', $1, $2, 2000, 1500, 'scott', 'tom', 'ben')`, [paid ? new Date() : null, lead]);
  }
}

test('Google Ads: spend against the enquiries, bookings and money its clicks brought', async () => {
  await enquiry('paid', { booked: true, paid: true });
  await enquiry('organic', { gclid: 'abc', booked: true });
  await enquiry('paid');
  await enquiry('organic', { booked: true, paid: true });
  await enquiry(null, { phone: true });
  await pool.query("insert into expenses (spent_on, amount_pence, category) values (current_date, 30000, 'Google Ads')");
  const g = await G.growth();
  const a = g.googleAds.month;
  assert.equal(a.spend, 30000);
  assert.equal(a.enquiries, 3, 'paid channel or a Google click id');
  assert.equal(a.booked, 2);
  assert.equal(a.money, 29500);
  assert.equal(a.perBooked, 15000);
  assert.equal(a.back, 0.98);
  const m = g.months[5];
  assert.equal(m.enquiries, 5);
  assert.equal(m.visitors, 5);
  assert.equal(m.booked, 3);
  assert.equal(m.paid, 2);
  const names = Object.fromEntries(g.sources.map((s) => [s.name, s.enquiries]));
  assert.deepEqual(names, { 'Google Ads': 3, 'Google search': 1, 'Phone call': 1 });
  assert.equal(g.sources[0].name, 'Google Ads', 'best money first');
});

test('the booking form step by step: who reached each step and who sent it, damp sites only', async () => {
  const visit = async (upTo, sent, site = 'dampscan') => {
    const sid = randomUUID();
    for (let s = 1; s <= upTo; s += 1) await pool.query("insert into events (session_id, type, detail, site) values ($1, 'form_step', $2, $3)", [sid, JSON.stringify({ step: s }), site]);
    await pool.query("insert into events (session_id, type, detail, site) values ($1, 'form_step', $2, $3)", [sid, JSON.stringify({ step: 1 }), site]);
    if (sent) await pool.query("insert into events (session_id, type, site) values ($1, 'form_submit', $2)", [sid, site]);
  };
  await visit(3, true); await visit(3, false); await visit(2, false); await visit(1, false, 'ati-london'); await visit(3, true, 'roofing');
  const g = await G.growth();
  assert.deepEqual(g.form.steps, [{ step: 1, n: 4 }, { step: 2, n: 3 }, { step: 3, n: 2 }], 'a session counts once per step');
  assert.equal(g.form.sent, 1);
  /* The old form, the 30 days before the four-step one went live, as opened and sent only. */
  const sid = randomUUID();
  await pool.query("insert into events (session_id, type, detail, site, created_at) values ($1, 'form_step', '{\"step\": 1}', 'dampscan', $2), ($1, 'form_submit', '{}', 'dampscan', $2)", [sid, '2026-11-10T12:00:00Z']);
  await pool.query("insert into events (session_id, type, detail, site, created_at) values ($1, 'form_step', '{\"step\": 1}', 'dampscan', '2026-11-11T12:00:00Z')", [randomUUID()]);
  const h = await G.growth();
  assert.deepEqual(h.form.before, { opened: 2, sent: 1 });
  assert.equal(h.form.since, '2026-11-16');
  assert.deepEqual(h.form.steps, g.form.steps, 'old events never muddle the new steps');
});
