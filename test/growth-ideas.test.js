/**
 * The owner's three (16 Nov 2026): paid customers sent back to Google Ads at
 * what they really paid, estate agents' own booking links and statements, and
 * the Monday briefing. None of them reaches a customer.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
process.env.SESSION_SECRET = 'a-test-secret-long-enough';
const R = await import('../lib/agent-referrals.js');
const A = await import('../lib/ads-conversions.js');
const W = await import('../lib/company-week.js');
const { sanitiseUtm } = await import('../lib/validate.js');
const { channelFor } = await import('../lib/attribution.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, estate_agents, events, expenses, cron_beats restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = async (utm, extra = {}) => Number((await pool.query(`insert into leads (session_id, stage, site, first_name, email, postcode, address_line1, utm, created_at)
  values ($1, 'complete', $2, 'Kim Lee', 'kim@example.com', 'ME19 6AB', '12 Mill Street', $3, coalesce($4, now())) returning id`,
  [randomUUID(), extra.site || 'dampscan', JSON.stringify(utm || {}), extra.at || null])).rows[0].id);
const job = async (leadId, f = {}) => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, paid_at, lead_id, estate_agent_id, survey_sent_at, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  values ($1, $2, 'Kim Lee', 'ME19 6AB', 'full-house', 29500, 'ben', 10000, true, current_date + $3::int, '10:00', $4, $5, $6, $7, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
  [f.site || 'dampscan', f.status || 'booked', f.days ?? -3, f.paid ? new Date() : null, leadId, f.agent || null, f.reported ? new Date() : null])).rows[0].id);

test('the website keeps iPhone click ids and an agent\'s code, and both iPhone ids count as Google Ads', () => {
  assert.deepEqual(sanitiseUtm({ gbraid: 'x1', wbraid: 'y2', ag: 'ab3cd4', other: 'z' }), { gbraid: 'x1', wbraid: 'y2', ag: 'ab3cd4' });
  assert.equal(channelFor({ utm: { gbraid: 'x1' } }), 'paid');
  assert.equal(channelFor({ utm: { wbraid: 'y2' } }), 'paid');
});

test('an enquiry through an agent\'s link is put down to them, apart from who lets us in', async () => {
  const { id, code } = await R.addAgent({ name: 'Fox & Co', branch: 'West Malling', email: 'hello@fox.example' }, 'dampscan');
  assert.match(code, /^[a-z2-9]{6}$/);
  assert.equal(R.linkFor('dampscan', code), `https://dampscan.co.uk/?ag=${code}`);
  const l = await lead({ ag: code.toUpperCase() });
  assert.equal(await R.referralFromLead(l), id);
  const row = (await pool.query('select referred_by, estate_agent_id, sched_log from leads where id = $1', [l])).rows[0];
  assert.equal(Number(row.referred_by), id);
  assert.equal(row.estate_agent_id, null, 'a referral never says the agent has the keys, which would change the texts');
  assert.match(JSON.stringify(row.sched_log), /Fox & Co \(West Malling\)'s booking link/);
  assert.equal(await R.referralFromLead(await lead({ ag: 'nosuch' })), null);
  assert.deepEqual(await R.addAgent({ name: '' }, 'dampscan'), { error: 'Type the agent\'s name.' });
  assert.ok((await R.addAgent({ name: 'X' }, 'roofing')).error, 'damp brands only');
});

test('an agent\'s statement holds first name and district only, one brand at a time', async () => {
  const { id, code } = await R.addAgent({ name: 'Fox & Co' }, 'dampscan');
  const l = await lead({ ag: code });
  await R.referralFromLead(l);
  await job(l, { paid: true, reported: true });
  await job(await lead({}), { agent: id, days: 4 });
  await job(await lead({}, { site: 'ati-london' }), { site: 'ati-london', agent: id });
  const d = await R.agentsView('dampscan');
  const a = d.agents.find((x) => x.id === id);
  assert.equal(a.link, `https://dampscan.co.uk/?ag=${code}`);
  assert.deepEqual(a.year, { sent: 1, surveys: 2, paid: 29500 });
  assert.deepEqual(a.work.map((w) => [w.first, w.district, w.stage, w.viaLink]), [['Kim', 'ME19', 'reported', true], ['Kim', 'ME19', 'booked', false]]);
  assert.ok(!JSON.stringify(d).includes('Mill Street') && !JSON.stringify(d).includes('6AB'), 'never a street or full postcode');
  const ati = await R.agentsView('ati-london');
  assert.equal(ati.agents.find((x) => x.id === id).link, `https://atidampsurvey.co.uk/?ag=${code}`);
  assert.equal(ati.agents.find((x) => x.id === id).work.length, 1, 'the other brand\'s work stays on its own side');
});

test('Google Ads is told what a paid click really paid, and a cancelled one drops out', async () => {
  const paid = await job(await lead({ gclid: 'G-1' }), { status: 'paid', paid: true });
  await pool.query(`insert into job_payments (job_id, amount_pence, label) values ($1, 29500, 'balance'), ($1, -5000, 'refund')`, [paid]);
  await job(await lead({ gclid: 'G-2' }), { status: 'cancelled', paid: true });
  await job(await lead({}), { status: 'paid', paid: true });
  const rows = await A.conversionsFor('dampscan');
  assert.deepEqual(rows.map((r) => [r.gclid, Number(r.pence)]), [['G-1', 24500]]);
  const before = await A.feedStatus('dampscan');
  assert.equal(before.lastFetched, null);
  assert.match(before.url, /\/api\/admin\/conversions\?site=dampscan&key=[0-9a-f]{32}$/);
  await A.fetched('dampscan');
  assert.ok((await A.feedStatus('dampscan')).lastFetched, 'Growth shows Google came for it');
});

test('the Monday briefing: last week against the week before, the week ahead by day', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const mon = W.mondayOf(today);
  assert.equal(new Date(mon + 'T12:00:00Z').getUTCDay(), 1);
  const lastWeek = new Date(Date.parse(W.addDays(mon, -5) + 'T12:00:00Z'));
  await lead({}, { at: lastWeek });
  await lead({}, { at: lastWeek });
  await lead({}, { at: new Date(Date.parse(W.addDays(mon, -10) + 'T12:00:00Z')) });
  const w = await W.week({ today });
  assert.equal(w.from, W.addDays(mon, -7));
  assert.equal(w.last.enquiries, 2);
  assert.equal(w.before.enquiries, 1);
  assert.equal(w.ahead.days.length, 7);
  assert.equal(w.toBook.n, 3);
  const line = W.weekPush(w);
  assert.match(line, /^Last week 2 enquiries \(1 the week before\)/);
  assert.ok(!/Kim|ME19/.test(line), 'counts only, never a customer');
});
