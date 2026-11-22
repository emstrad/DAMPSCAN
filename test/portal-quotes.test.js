/**
 * A quote to check from the customer's page (the owner, 22 Nov 2026): only once
 * the report is done, only files our upload route made (PDF or photos), five at
 * most, kept on the survey with one owners' to-do that closes once we answer.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'quotes-secret-long-enough-xxxxxxxxxxxx';
process.env.IP_SALT = 'quotes-salt-long-enough-for-the-check-xxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const Q = await import('../lib/portal-quotes.js');
const { buildView } = await import('../lib/portal-view.js');
const { doneBecause } = await import('../lib/todo-sweep.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, notifications, portal_events restart identity cascade'); });
after(async () => { await pool.end(); });

const req = { headers: { 'user-agent': 'iPhone' }, socket: { remoteAddress: '1.2.3.4' } };
const file = (n, ext = 'pdf') => `leads/2026-11-22/0b6a1f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5${n}-quote.${ext}`;
async function job(done = true) {
  const id = Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_price_pence, date_set, job_date, job_time, surveyor, survey_type, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('dampscan', 'booked', 'Kim Lee', 'ME19 6AB', 29500, true, current_date - 3, '09:00', 'ben', 'localised', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`)).rows[0].id);
  if (done) await pool.query("update jobs set deposit_paid_at = now(), paid_at = now(), survey_sent_at = now(), report_path = 'r/x.pdf' where id = $1", [id]);
  return id;
}
const row = async (id) => (await pool.query(`select j.*, j.job_date::text as job_day, 0 as paid_pence, 0 as refunded_pence, '{}'::text[] as lead_files from jobs j where id = $1`, [id])).rows[0];

test('a quote only once the report is done, only our own uploads, five files at most', async () => {
  const early = await job(false);
  assert.deepEqual(await Q.addQuote(req, await row(early), [file(1)]), { error: 'not_now' }, 'nothing to check it against yet');
  const id = await job();
  assert.deepEqual(await Q.addQuote(req, await row(id), ['reports/other.pdf', '../x.pdf', file(2, 'exe')]), { error: 'no_files' });
  assert.deepEqual(await Q.addQuote(req, await row(id), [file(1), file(2, 'jpg')]), { ok: true, added: 2 });
  assert.deepEqual(await Q.addQuote(req, await row(id), [file(3), file(4), file(5), file(6)]), { error: 'too_many' });
  const j = await row(id);
  assert.deepEqual(j.customer_quotes, [file(1), file(2, 'jpg')]);
  assert.deepEqual(buildView(j).quotes, ['quote.pdf', 'quote.jpg'], 'their page names the files, never the stored path');
  assert.match(j.sched_log.at(-1).note, /Sent a quote to check against their report \(2 files\)/);
  assert.match((await pool.query("select title from notifications where kind = 'portal_quote'")).rows[0].title, /Quote to check/);
});

test('one to-do per survey, which closes once we answer them', async () => {
  const id = await job();
  await Q.addQuote(req, await row(id), [file(1)]);
  await Q.addQuote(req, await row(id), [file(2)]);
  const todos = (await pool.query('select * from todos where job_id = $1', [id])).rows;
  assert.equal(todos.length, 1);
  assert.equal(doneBecause(todos[0], await row(id), null, false), null, 'still to answer, though the survey is paid and reported');
  await pool.query(`update jobs set sched_log = sched_log || jsonb_build_array(jsonb_build_object('at', now() + interval '1 second', 'by', 'Scott', 'how', 'text', 'note', 'We replied: looks fine'))  where id = $1`, [id]);
  assert.equal(doneBecause(todos[0], await row(id), null, false), 'answered them');
});
