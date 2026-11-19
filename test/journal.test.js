/**
 * The brain's memory (db/schema.sql journal): every change written by the
 * database itself, whatever made it. An update keeps only what changed, a
 * history entry only its new lines, quiet stamps nothing, and texts, payments
 * and to-dos land against their customer.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
const q = async (t, p = []) => (await pool.query(t, p)).rows;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
after(async () => { await pool.end(); });

let since = 0;
before(async () => { since = Number((await q('select coalesce(max(id), 0) as m from journal'))[0].m); });

test('every change to a survey, its texts, payments and to-dos is journalled against the customer', async () => {
  const [{ id }] = await q(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date)
    values ('dampscan', 'booked', 'Journal Kim', 'ME19 6AB', 'full-house', 29500, 'ben', 0, 0, '', '', '', true, current_date + 3) returning id`);
  const jid = Number(id);
  const made = await q('select op, changes from journal where source = $1 and job_id = $2 and id > $3', ['jobs', jid, since]);
  assert.equal(made[0].op, 'insert');
  assert.equal(made[0].changes.customer_name, 'Journal Kim');

  await q(`update jobs set survey_price_pence = 31000, unpaid_alerted_at = now() where id = $1`, [jid]);
  const [price] = await q(`select changes from journal where job_id = $1 and id > $2 and op = 'update' order by id desc limit 1`, [jid, since]);
  assert.deepEqual(price.changes.survey_price_pence, [29500, 31000], 'before and after');
  assert.equal(price.changes.unpaid_alerted_at, undefined, 'a stamp nobody reads is left out');

  const n = (await q('select count(*)::int as n from journal where job_id = $1 and id > $2', [jid, since]))[0].n;
  await q('update jobs set unpaid_alerted_at = now() where id = $1', [jid]);
  assert.equal((await q('select count(*)::int as n from journal where job_id = $1 and id > $2', [jid, since]))[0].n, n, 'a quiet-only change writes nothing');

  await q(`update jobs set sched_log = '[{"at":"2026-11-19T10:00:00Z","how":"call","note":"First call"}]'::jsonb where id = $1`, [jid]);
  await q(`update jobs set sched_log = sched_log || '[{"at":"2026-11-19T11:00:00Z","how":"text","note":"Second"}]'::jsonb where id = $1`, [jid]);
  const [hist] = await q(`select changes from journal where job_id = $1 and id > $2 and changes ? 'sched_log' order by id desc limit 1`, [jid, since]);
  assert.deepEqual(hist.changes.sched_log.map((e) => e.note), ['Second'], 'only the new history line');

  await q(`insert into sms_outbox (site, job_id, kind, dedupe) values ('dampscan', $1, 'booked', 'j1')`, [jid]);
  await q(`insert into job_payments (job_id, amount_pence, label, paid_on) values ($1, 15500, 'deposit', current_date)`, [jid]);
  await q(`insert into todos (site, job_id, text) values ('dampscan', $1, 'Chase the deposit')`, [jid]);
  const sources = (await q('select distinct source from journal where job_id = $1 and id > $2', [jid, since])).map((r) => r.source).sort();
  assert.deepEqual(sources, ['job_payments', 'jobs', 'sms_outbox', 'todos']);
});

test('an enquiry is journalled under its own number', async () => {
  const [{ id }] = await q(`insert into leads (site, stage, first_name, email, postcode, session_id) values ('ati-london', 'complete', 'Lee', 'lee@x.com', 'SE4 1PE', gen_random_uuid()) returning id`);
  await q(`update leads set sched_stage = 'contacted' where id = $1`, [id]);
  const rows = await q('select op, changes from journal where lead_id = $1 and id > $2 order by id', [id, since]);
  assert.deepEqual(rows.map((r) => r.op), ['insert', 'update']);
  assert.deepEqual(rows[1].changes.sched_stage, [null, 'contacted']);
});
