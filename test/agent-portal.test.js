/**
 * The estate agent's own page (the owner, 18 Nov 2026): one link per agent,
 * every property of theirs urgent first, Quick book making an enquiry put down
 * to them, confirming access in one tap and asking for another time.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'agent-secret-long-enough-xxxxxxxxxxxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: 'true' }), text: async () => '' });
const P = await import('../lib/agent-portal.js');
const B = await import('../lib/agent-book.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, estate_agents, notifications, sms_outbox restart identity cascade'); });
after(async () => { await pool.end(); });

const agent = async () => Number((await pool.query(`insert into estate_agents (name, branch, phone, email, site) values ('Foxtons', 'Lewisham', '02081234567', 'lewisham@example.com', 'ati-london') returning id`)).rows[0].id);
const job = async (a, f = {}) => Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_address, customer_phone, survey_type, survey_price_pence, surveyor, surveyor_fee_pence,
    date_set, job_date, job_time, awaiting_agent, estate_agent_id, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
  values ('ati-london', 'booked', 'Kim Lee', 'SE4 2EB', '59 St Asaph Road, London', '07700900123', null, 29500, 'tom', 13000, true, current_date + $2::int, '10:00', $3, $1, 2000, 1500, 'scott', 'tom', 'ben') returning id`,
  [a, f.days ?? 3, f.waiting ?? false])).rows[0].id);

test('one link per agent, opening only their own properties, a time to confirm first', async () => {
  const a = await agent();
  const link = await P.agentPageFor(a);
  assert.match(link, /^https:\/\/atidampsurvey\.co\.uk\/a\/[A-Za-z0-9_-]{30,}$/);
  assert.equal(await P.agentPageFor(a), link, 'the same link each time');
  const found = await P.agentByToken(link.split('/a/')[1]);
  assert.equal(Number(found.id), a);
  assert.equal(await P.agentByToken('nope-nope-nope-nope-nope'), null);
  const booked = await job(a);
  const waiting = await job(a, { waiting: true, days: 5 });
  await job(await agent().catch(async () => Number((await pool.query(`insert into estate_agents (name, site) values ('Other', 'ati-london') returning id`)).rows[0].id)));
  const v = await P.agentView(found);
  assert.deepEqual(v.needsYou.map((s) => s.id), [waiting]);
  assert.deepEqual(v.current.map((s) => s.id), [booked], 'never another agent\'s');
  const s = v.current[0];
  assert.equal(s.stage.label, 'Booked');
  assert.equal(s.name, 'Kim Lee');
  assert.equal(s.money.due, 29500);
  assert.equal(v.code, 's2');
});

test('Quick book makes an enquiry put down to them, the agent letting us in when they have the keys', async () => {
  const a = await agent();
  const me = await P.agentByToken((await P.agentPageFor(a)).split('/a/')[1]);
  const bad = await B.quickBook(me, { address: '', postcode: 'x', name: '', phone: '0770' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['address', 'email', 'name', 'phone', 'postcode']);
  const out = await B.quickBook(me, { address: '12 Vale Road', town: 'London', postcode: 'se42eb', name: 'Sam Patel', phone: '+44 7700 900456', email: 'sam@example.com', reason: 'valuer', access: 'agent' });
  const l = (await pool.query('select * from leads where id = $1', [out.leadId])).rows[0];
  assert.equal(l.session_id, out.sessionId);
  assert.deepEqual([l.postcode, l.phone, Number(l.referred_by), Number(l.estate_agent_id), l.site], ['SE4 2EB', '07700900456', a, a, 'ati-london']);
  assert.match(l.notes, /Mortgage valuer flagged damp/);
  const vendor = await B.quickBook(me, { address: '3 Hill St', postcode: 'SE4 1AA', name: 'Jo', phone: '07700900111', email: 'jo@example.com', access: 'vendor', contact: 'Mr Brown 07700900789' });
  assert.equal((await pool.query('select estate_agent_id from leads where id = $1', [vendor.leadId])).rows[0].estate_agent_id, null, 'the vendor lets us in, so the texts are not the agent ones');
  const v = await P.agentView(me);
  assert.equal(v.current.filter((s) => s.kind === 'lead').length, 2, 'both show while being arranged');
});

test('confirming access clears the wait; asking for another time is a request with a to-do', async () => {
  const a = await agent();
  const me = (await pool.query('select * from estate_agents where id = $1', [a])).rows[0];
  const id = await job(a, { waiting: true });
  const ask = await B.askAnother(me, id, { note: 'Any morning next week' });
  assert.equal(ask.ok, true);
  assert.equal((await pool.query('select agent_ask from jobs where id = $1', [id])).rows[0].agent_ask.note, 'Any morning next week');
  assert.equal((await pool.query(`select count(*)::int as n from todos where job_id = $1 and done_at is null`, [id])).rows[0].n, 1);
  assert.equal((await B.confirmAccess(me, id)).ok, true);
  const j = (await pool.query('select awaiting_agent, agent_ask from jobs where id = $1', [id])).rows[0];
  assert.deepEqual([j.awaiting_agent, j.agent_ask], [false, null]);
  assert.equal((await B.confirmAccess(me, id)).error, 'not_waiting');
  const other = Number((await pool.query(`insert into estate_agents (name, site) values ('Other', 'ati-london') returning id`)).rows[0].id);
  const theirs = await job(other, { waiting: true });
  assert.equal((await B.confirmAccess(me, theirs)).error, 'not_waiting', 'never another agent\'s survey');
});

test('phone boxes take a UK number of the right length', () => {
  assert.deepEqual(B.ukPhone('07700 900123'), { ok: true, value: '07700900123' });
  assert.equal(B.ukPhone('+447700900123').value, '07700900123');
  assert.equal(B.ukPhone('0770090012').ok, false);
  assert.equal(B.ukPhone('07700-900123').ok, false);
});
