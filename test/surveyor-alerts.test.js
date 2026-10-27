/**
 * Each surveyor's own feed: booked, moved, handed to someone else and
 * cancelled each tell the right person once, a save that changes nothing
 * about the visit says nothing, and no topic means nothing is sent.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});
const sent = [];
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
const { tellSurveyors, tellPencil } = await import('../lib/surveyor-alerts.js');
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'ronnie', '2030-06-01', '10:00', true, 'Kim Smith', 'ME19 6AB', 0, 0, '', '', '', 0, 0, 0, 5000) returning id`;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { sent.length = 0; await pool.query('truncate jobs restart identity cascade'); Object.assign(process.env, { NTFY_TOPIC_RONNIE: 'r-topic', NTFY_TOPIC_BEN: 'b-topic' }); });
after(async () => { delete process.env.NTFY_TOPIC_RONNIE; delete process.env.NTFY_TOPIC_BEN; await pool.end(); });

test('booked, unchanged, moved, handed over and cancelled each go to the right feed once', async () => {
  const id = (await pool.query(JOB)).rows[0].id;
  await tellSurveyors(id);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, 'r-topic');
  assert.equal(sent[0].title, 'Survey booked for you');
  assert.match(sent[0].message, /^Kim, ME19, Sat 1 Jun at 10:00/);
  assert.doesNotMatch(sent[0].message, /6AB|£/);
  await tellSurveyors(id);
  assert.equal(sent.length, 1, 'nothing changed, nothing said');
  await pool.query("update jobs set job_time = '14:00' where id = $1", [id]); await tellSurveyors(id);
  assert.equal(sent[1].title, 'Survey moved');
  await pool.query("update jobs set surveyor = 'ben' where id = $1", [id]); await tellSurveyors(id);
  assert.deepEqual(sent.slice(2).map((s) => [s.topic, s.title]), [['r-topic', 'Taken off your diary'], ['b-topic', 'Survey booked for you']]);
  await pool.query("update jobs set status = 'cancelled' where id = $1", [id]); await tellSurveyors(id);
  assert.deepEqual([sent[4].topic, sent[4].title], ['b-topic', 'Survey cancelled']);
});

test('no topic, nothing sent; a pencilled time is told as not confirmed', async () => {
  delete process.env.NTFY_TOPIC_RONNIE;
  const id = (await pool.query(JOB)).rows[0].id;
  await tellSurveyors(id);
  assert.equal(sent.length, 0);
  await tellPencil({ surveyor: 'ben', name: 'Raj Patel', postcode: 'CT5 1AA', date: '2030-06-02', time: '09:00', by: 'Website' });
  assert.equal(sent[0].title, 'Time requested by a customer');
  assert.match(sent[0].message, /Not confirmed yet/);
});
