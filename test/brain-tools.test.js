/**
 * The brain for ChatGPT and Claude (lib/mcp/brain-tools.js): customer_story
 * finds one customer from their words and gives their whole record (changes,
 * emails read whole, questions open); several matches are listed; a surveyor
 * is refused; answer_brain_question lets a question go.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { TOOLS } = await import('../lib/mcp/tools.js');
const run = (name, scope, args) => TOOLS.find((t) => t.name === name).run(scope, args);
const BOSS = { isAdmin: true, name: 'Owners', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } };
const BEN = { isAdmin: false, personId: 9, name: 'Ben', businesses: ['dampscan'], levels: { dampscan: 'work' } };

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, mail_items, brain_asks, customer_state restart identity cascade'); });
after(async () => { await pool.end(); });

async function job(name, postcode) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date)
    values ('dampscan', 'completed', $1, $2, 'full-house', 29500, 'ben', 0, 0, '', '', '', true, '2026-11-14') returning id`, [name, postcode])).rows[0].id);
}

test('customer_story: one customer from their words, with every change, every email whole and the open question', async () => {
  const id = await job('Anne Adams', 'CT5 1HZ');
  await pool.query('update jobs set survey_price_pence = 31000 where id = $1', [id]);
  await pool.query(`insert into mail_items (message_id, at, dir, subject, body, job_id, site) values ('m1', now(), 'out', 'Your report', 'Hi Anne, thank you for your payment.', $1, 'dampscan')`, [id]);
  await pool.query(`insert into brain_asks (job_id, site, kind, say) values ($1, 'dampscan', 'looks_paid', 'Looks paid in full.')`, [id]);
  const out = (await run('customer_story', BOSS, { words: 'anne ct51hz' })).data;
  assert.equal(out.customer, 'Anne Adams');
  assert.deepEqual(out.questions, ['Looks paid in full.']);
  assert.equal(out.emails[0].from, 'us');
  assert.match(out.emails[0].body, /thank you for your payment/);
  assert.ok(out.changes.some((c) => c.what === 'jobs update' && c.changes.survey_price_pence), 'the price change is in the story');
});

test('several match: listed to ask which; a surveyor is refused; a question let go is closed', async () => {
  await job('Anne Adams', 'CT5 1HZ');
  const id = await job('Anne Brown', 'ME19 6AB');
  const many = (await run('customer_story', BOSS, { words: 'anne' })).data;
  assert.equal(many.matches.length, 2);
  assert.equal((await run('customer_story', BEN, { words: 'anne' })).data.ok, false, 'no money for a surveyor');
  assert.equal((await run('whats_next', BEN, {})).data.ok, false);
  await pool.query(`insert into brain_asks (job_id, site, kind, say) values ($1, 'dampscan', 'looks_paid', 'Looks paid.')`, [id]);
  const a = (await run('answer_brain_question', BOSS, { words: 'anne brown', yes: false })).data;
  assert.match(a.said, /Let go/);
  assert.equal((await pool.query('select status from brain_asks where job_id = $1', [id])).rows[0].status, 'no');
});
