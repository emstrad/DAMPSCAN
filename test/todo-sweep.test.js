/**
 * The system's own to-dos close themselves once done (the owner, 16 Nov
 * 2026); one a person added still waits for a person.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const S = await import('../lib/todo-sweep.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, todos, sms_outbox restart identity cascade'); });
after(async () => { await pool.end(); });

async function job() {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('ati-london', 'booked', 'Kim Lee', 'SE4 1AA', 'full-house', 29500, 'tom', 13000, true, current_date + 5, '10:00', 2000, 1500, 'scott', 'tom', 'ben') returning id`)).rows[0].id);
}
const todo = async (jobId, text, by) => Number((await pool.query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ('ati-london', $1, $2, $3, 'manual', true) returning id`, [jobId, text, by])).rows[0].id);
const isDone = async (id) => Boolean((await pool.query('select done_at from todos where id = $1', [id])).rows[0].done_at);

test('a deposit chase closes once the deposit is in; one a person added stays', async () => {
  const id = await job();
  const chase = await todo(id, 'Chase Kim (SE4) for the £147.50 deposit: booked 2 days ago and nothing paid yet. The booking stays.', 'Money check');
  const mine = await todo(id, 'Chase Kim for the deposit', 'Scott');
  assert.equal(await S.sweepSystemTodos(), 0, 'nothing done yet');
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [id]);
  assert.equal(await S.sweepSystemTodos({ jobId: id }), 1);
  assert.equal(await isDone(chase), true);
  assert.equal(await isDone(mine), false, 'a person\'s to-do waits for a person');
});

test('a failed text closes once a later text goes through; a cancelled survey closes its system to-dos but not a refund still owed', async () => {
  const id = await job();
  const failed = await todo(id, 'A "Booked, deposit due" text couldn\'t be sent: call them instead.', 'Texts');
  await S.sweepSystemTodos();
  assert.equal(await isDone(failed), false);
  await pool.query(`insert into sms_outbox (site, job_id, kind, status, sent_at) values ('ati-london', $1, 'paid', 'delivered', now() + interval '1 minute')`, [id]);
  await S.sweepSystemTodos();
  assert.equal(await isDone(failed), true);

  const gone = await job();
  const chase = await todo(gone, 'Chase Kim (SE4) for the £147.50 deposit: booked 2 days ago.', 'Money check');
  await pool.query(`insert into job_payments (job_id, amount_pence, label) values ($1, 14750, 'deposit')`, [gone]);
  await pool.query("update jobs set status = 'cancelled', cancelled_at = now(), deposit_paid_at = now() where id = $1", [gone]);
  const refund = await todo(gone, 'Refund Kim (SE4) £147.50: cancelled 48 hours or more before the survey, so it all goes back.', 'Money check');
  await S.sweepSystemTodos();
  assert.equal(await isDone(chase), true);
  assert.equal(await isDone(refund), false, 'money still owed back keeps its to-do');
});
