/**
 * ChatGPT and the phone find and add customers at all costs (the owners'
 * choice, 10 Nov 2026): forgiving search, a card from an email with no
 * surveyor or postcode, a booking with no surveyor becoming a card instead of
 * a failure, and an enquiry's details corrected.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'cards-secret-long-enough-xxxxxxxxxxxx';
process.env.IP_SALT = 'cards-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { TOOLS } = await import('../lib/mcp/tools.js');
const { scopeFor } = await import('../lib/access.js');
const { findClient } = await import('../lib/mcp/client-tools.js');
const { findLeads } = await import('../lib/lead-status.js');
const owners = () => scopeFor({ person: false, name: 'Owners' });
const tool = (name) => TOOLS.find((t) => t.name === name);

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, jobs, todos, audit, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = (site, name, postcode, phone, email) => pool.query(`insert into leads (site, stage, first_name, postcode, phone, email, session_id) values ($1, 'complete', $2, $3, $4, $5, gen_random_uuid()) returning id`, [site, name, postcode, phone, email]);

test('the phone search and ChatGPT find people however they are typed', async () => {
  await lead('ati-london', 'Hannah', 'SE5 9NU', '07903906705', 'hb@example.com');
  await lead('ati-london', 'Hannah', 'N4 4ED', '07000000001', 'other@example.com');
  const s = await owners();
  for (const words of ['Hannah Brunton SE5 9NU', '07903 906705', '+44 7903 906705', 'hb@example', 'se59nu']) {
    const found = (await findClient(s, { text: words })).data.clients;
    assert.equal(found.length, 1, `${words}: ${JSON.stringify(found)}`);
    assert.equal(found[0].postcode, 'SE5 9NU');
  }
  assert.equal((await findLeads(s, 'Richard Sieff W5 4AS')).length, 0, 'nobody of that name or postcode');
  assert.equal((await findLeads(s, 'Hannah Brunton SE5 9NU')).length, 1, 'a surname the form never stored is forgiven');
});

test('ChatGPT adds a customer from an email with no surveyor or postcode, and never twice', async () => {
  const s = await owners();
  const r = await tool('add_enquiry').run(s, { site: 'dampscan', name: 'Sam Neter', email: 'sam@example.com', said: 'Wants a damp survey on 38 Farm Way' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = (await pool.query('select * from leads where id = $1', [r.data.card.id])).rows[0];
  assert.deepEqual([row.sched_stage, row.source_path, row.postcode], ['new', 'email', '']);
  assert.equal(row.sched_log[0].how, 'email');
  const again = await tool('add_enquiry').run(s, { site: 'dampscan', name: 'Sam Neter', email: 'SAM@example.com', phone: '07700 900333', said: 'Can you do Friday?' });
  assert.equal(again.data.merged, true, 'the same email is merged into the card');
  const merged = (await pool.query('select * from leads where id = $1', [r.data.card.id])).rows[0];
  assert.equal(merged.phone, '07700 900333', 'the phone it lacked is filled in');
  assert.ok(merged.sched_log.some((e) => /Can you do Friday/.test(e.note)));
  assert.equal((await pool.query('select count(*)::int as n from leads')).rows[0].n, 1, 'never a second card');
  const half = await tool('add_enquiry').run(s, { site: 'ati-london', name: 'Hannah', postcode: 'SE5 9NU', email: 'h1@example.com' });
  const halfAgain = await tool('add_enquiry').run(s, { site: 'ati-london', name: 'Hannah Brunton', postcode: 'se59nu', email: 'h2@example.com' });
  assert.equal(halfAgain.data.card.id, half.data.card.id, 'same first name and postcode is the same person');
  const byPatch = await tool('add_enquiry').run(s, { name: 'Richard', postcode: 'W5 4AS', phone: '07123456789' });
  assert.equal((await pool.query('select site from leads where id = $1', [byPatch.data.card.id])).rows[0].site, 'ati-london', 'a London postcode is ATi');
});

test('a survey with no surveyor becomes a card, not a failure; an enquiry can be corrected', async () => {
  const s = await owners();
  const r = await tool('create_job').run(s, { site: 'dampscan', customer_name: 'Mina Annum', postcode: 'DA16 1SP', phone: '07903906705', survey_type: 'dt-full-house', price_pounds: 445, note: 'Level 3 report received' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await pool.query('select count(*)::int as n from jobs')).rows[0].n, 0);
  const card = (await pool.query('select * from leads where id = $1', [r.data.card.id])).rows[0];
  assert.match(card.notes, /dt-full-house.*£445/);
  const u = await tool('update_client').run(s, { id: 'Mina DA16 1SP', name: 'Mina Annum', address: '28 Warwick Road, Welling' });
  assert.equal(u.status, 200, JSON.stringify(u.data));
  assert.equal((await pool.query('select address_line1 from leads where id = $1', [card.id])).rows[0].address_line1, '28 Warwick Road, Welling');
});
