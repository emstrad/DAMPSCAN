/**
 * Alex Krutnik's day (17 Nov 2026): the websites' own error log, a job card
 * filled in from the form he left half done, and a postcode typed by hand
 * stored tidy.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const E = await import('../lib/site-errors.js');
const { fillJob } = await import('../lib/merge-dupes.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate site_errors, jobs, leads restart identity cascade'); });
after(async () => { await pool.end(); });

test('the log keeps where and why, never an email or phone, and Growth counts each kind', async () => {
  await E.logSiteError({ site: 'dampscan', kind: 'form_refused', path: '/damp-survey/ramsgate', step: 2, field: 'issues', message: 'Pick at least one, "Not sure" is fine.', device: 'desktop', sessionId: randomUUID() });
  await E.logSiteError({ site: 'ati-london', kind: 'page_error', step: '2', field: '/assets/bf.js:120', message: 'x is undefined for alex@example.com on 07969 112229' });
  await E.logSiteError({ kind: 'nonsense', message: 'dropped' });
  const v = await E.siteErrors();
  assert.deepEqual(v.counts.map((c) => [c.kind, c.n]), [['form_refused', 1], ['page_error', 1], ['server_error', 0]]);
  const page = v.latest.find((r) => r.kind === 'page_error');
  assert.equal(page.step, 2);
  assert.equal(page.message, 'x is undefined for [email] on [number]');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  assert.equal(await E.errorsBetween(today, today), 2);
});

test('a half-finished form fills what a card made by hand lacks, and a typed postcode is stored tidy', async () => {
  const lead = Number((await pool.query(`insert into leads (session_id, stage, site, first_name, email, phone, postcode, address_line1, town)
    values ($1, 'partial', 'dampscan', 'Alex', 'alexkrutnik@outlook.com', '+447969112229', 'CT11 9LS', '63 Vale Road', 'Ramsgate') returning id`, [randomUUID()])).rows[0].id);
  const job = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_email, customer_address, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', 'booked', 'Alex Krutnik', 'Ct119ls', 'alexkrutnik@outlook.com', '63 vale road', 'dt-full-house', 44500, 'tom', 13000, false, 2000, 1500, 'scott', 'tom', 'ben') returning id`)).rows[0].id);
  let j = (await pool.query('select * from jobs where id = $1', [job])).rows[0];
  assert.equal(j.customer_postcode, 'CT11 9LS', 'tidied as it was saved');
  await fillJob(job, lead);
  j = (await pool.query('select * from jobs where id = $1', [job])).rows[0];
  assert.equal(j.customer_phone, '+447969112229');
  assert.equal(j.customer_address, '63 vale road, Ramsgate');
  assert.equal(Number(j.lead_id), lead);
  await pool.query("update jobs set customer_postcode = 'not a postcode' where id = $1", [job]);
  assert.equal((await pool.query('select customer_postcode from jobs where id = $1', [job])).rows[0].customer_postcode, 'not a postcode', 'anything else is left as typed');
});
