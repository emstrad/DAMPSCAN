/**
 * The 18 Nov 2026 edge-case sweep: every screen agrees on where a customer
 * stands. Report ready counts as reported on the lists, an undated job card on
 * Scheduling carries its street, problem and photos, a time picked online is
 * flagged, and a cancelled survey is not money paid on Growth.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const S = await import('../lib/surveys.js');
const Sched = await import('../lib/scheduling.js');
const G = await import('../lib/company-growth.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, events restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = async () => Number((await pool.query(`insert into leads (session_id, stage, site, first_name, email, postcode, address_line1, town, issues, files)
  values ($1, 'complete', 'ati-london', 'Kim', 'kim@example.com', 'SE4 2EB', '59 St Asaph Road', 'London', '{Damp}', '{leads/a.jpg}') returning id`, [randomUUID()])).rows[0].id);
const job = async (f = {}) => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time,
    paid_at, report_ready_at, lead_id, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  values ('ati-london', $1, 'Kim Lee', 'SE4 2EB', 'full-house', 29500, 'tom', 13000, $2, current_date + $3::int, $4, $5, $6, $7, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
  [f.status || 'booked', f.dated ?? true, f.days ?? -2, f.time === undefined ? '10:00' : f.time, f.paid ? new Date() : null, f.ready ? new Date() : null, f.lead || null])).rows[0].id);

test('Report ready counts as reported on the board and After the visit, paid or not', async () => {
  const paid = await job({ status: 'completed', paid: true, ready: true });
  const owed = await job({ status: 'completed', ready: true });
  assert.equal((await S.surveyById(paid, ['ati-london'])).stage, 'sent', 'not "paid, report to send"');
  assert.equal((await S.surveyById(owed, ['ati-london'])).stage, 'sent', 'not "surveyed, not paid"');
});

test('an undated job card on Scheduling shows its street, problem and photos, and a time picked online is flagged', async () => {
  const l = await lead();
  await job({ dated: false, time: null, lead: l, days: 5 });
  await pool.query(`update jobs set pencil_date = current_date + 5, pencil_time = '10:00', pencil_surveyor = 'tom', pencil_by = 'Website', pencil_set_at = now()`);
  const { cards } = await Sched.board(['ati-london'], new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }));
  const c = cards.find((x) => x.kind === 'job');
  assert.equal(c.street, '59 St Asaph Road, London');
  assert.deepEqual(c.issues, ['Damp']);
  assert.deepEqual(c.files, ['leads/a.jpg']);
  assert.equal(c.pencil.by, 'Website', 'the board and card flag it as picked online');
  assert.ok(c.pencil.setAt);
});

test('a survey paid then cancelled is not money paid on Growth', async () => {
  const l = await lead();
  await job({ status: 'cancelled', paid: true, lead: l });
  const g = await G.growth();
  assert.equal(g.year.paid, 0);
  assert.equal(g.year.money, 0);
});
