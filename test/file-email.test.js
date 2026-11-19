/**
 * Filing an email on the right card (19 Nov 2026: Edward's reply went to
 * another customer, whose phone held the enquiry's number): a number is the
 * enquiry's own, the open enquiry wins over the same person's old one that
 * became a survey, and a wrongly filed email comes back off.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { TOOLS } = await import('../lib/mcp/tools.js');
const run = (name, args) => TOOLS.find((t) => t.name === name).run({ isAdmin: true, name: 'Owners', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } }, args);

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, audit restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = async (name, phone, postcode) => Number((await pool.query(`insert into leads (site, stage, first_name, email, phone, postcode, session_id)
  values ('ati-london', 'complete', $1, $2, $3, $4, gen_random_uuid()) returning id`, [name, `${name.toLowerCase()}@x.com`, phone, postcode])).rows[0].id);
const log = async (id) => (await pool.query('select sched_log from leads where id = $1', [id])).rows[0].sched_log || [];
const EMAIL = { direction: 'out', subject: 'Re: Damp Survey', body: 'We have availability next week.', sent_at: '2026-11-19T10:38:24Z' };

test('the open enquiry wins over the same person\'s old one that became a survey; a number is the enquiry\'s own', async () => {
  const old = await lead('Edward', '07939286916', 'E1 3LE');
  await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, lead_id)
    values ('ati-london', 'cancelled', 'Edward', 'E1 3LE', 21500, 'tom', 0, 0, '', '', '', $1)`, [old]);
  const open = await lead('Edward', '00447939286916', 'E1 3LE');
  const other = await lead('Morris', `0789${open}0000`, 'SW15 1AA');
  const out = (await run('log_email', { ...EMAIL, enquiry: 'edward E1 3LE' })).data;
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal((await log(open)).length, 1, 'on the open enquiry');
  assert.equal((await log(old)).length, 0);

  const byNumber = (await run('log_email', { ...EMAIL, subject: 'Second', enquiry: String(open) })).data;
  assert.equal(byNumber.card.id, open, 'the number is the enquiry, never digits in a phone');
  assert.equal((await log(other)).length, 0);
});

test('a wrongly filed email comes back off the card', async () => {
  const morris = await lead('Morris', '07891520000', 'SW15 1AA');
  await run('log_email', { ...EMAIL, enquiry: String(morris) });
  assert.equal((await log(morris)).length, 1);
  const off = (await run('unfile_email', { enquiry: String(morris), subject: 'Re: Damp Survey', sent_at: '2026-11-19T10:38:24Z' })).data;
  assert.match(off.said, /taken off Morris/);
  assert.equal((await log(morris)).length, 0);
});

test('mark_report_sent with no_text marks it sent and quiet, so no report text ever goes', async () => {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date, report_path, report_name, paid_at)
    values ('ati-london', 'completed', 'Richard Chasey', 'IG6 2NW', 'full-house', 34500, 'tom', 0, 0, '', '', '', true, '2026-11-16', 'reports/r.pdf', 'r.pdf', now()) returning id`)).rows[0].id);
  const out = await run('mark_report_sent', { id, no_text: true });
  assert.ok(out.status < 400, JSON.stringify(out.data));
  const j = (await pool.query('select survey_sent_at, report_quiet from jobs where id = $1', [id])).rows[0];
  assert.ok(j.survey_sent_at && j.report_quiet);
});
