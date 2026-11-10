/**
 * One list, one next step per customer (the owners' choice, 10 Nov 2026):
 * every call, email or text sets when to get back to them, due ones join the
 * one to-do list, and a to-do can sit on an enquiry not booked yet.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'next-secret-long-enough-xxxxxxxxxxxxx';
process.env.IP_SALT = 'next-salt';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { workingDays, dayFor, nextFor } = await import('../lib/next-contact.js');
const { logContact } = await import('../lib/scheduling.js');
const { addEmail } = await import('../lib/correspondence.js');
const { actionsFor } = await import('../lib/work.js');
const { addTodo, todosFor } = await import('../lib/todos.js');
const { londonToday } = await import('../lib/pipeline.js');
const { TOOLS } = await import('../lib/mcp/tools.js');
const { scopeFor } = await import('../lib/access.js');
const owners = () => scopeFor({ person: false, name: 'Owners' });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, jobs, todos, audit, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

const lead = async (name, postcode) => Number((await pool.query(`insert into leads (site, stage, first_name, postcode, phone, email, session_id)
  values ('dampscan', 'complete', $1, $2, '07700900111', 'k@example.com', gen_random_uuid()) returning id`, [name, postcode])).rows[0].id);
const next = async (id) => (await pool.query('select next_contact_on::text as on, next_contact_why as why from leads where id = $1', [id])).rows[0];

test('working days skip the weekend; the chips read as days', () => {
  assert.equal(workingDays(2, '2026-11-13'), '2026-11-17', 'Friday plus two working days is Tuesday');
  assert.equal(dayFor('tomorrow', '2026-11-13'), '2026-11-16');
  assert.equal(dayFor('week', '2026-11-13'), '2026-11-20');
  assert.equal(dayFor('none', '2026-11-13'), null);
  assert.equal(dayFor('2026-12-01'), '2026-12-01');
  assert.equal(dayFor('soonish'), undefined);
  assert.equal(nextFor({ how: 'note' }, undefined), undefined, 'a plain note leaves it alone');
});

test('a logged call sets the next contact; an email from them is a reply due today', async () => {
  const id = await lead('Kim', 'ME19 6AB');
  await logContact('lead', id, { at: new Date().toISOString(), by: 'Scott', how: 'call', note: 'No answer' });
  assert.deepEqual(await next(id), { on: workingDays(2), why: 'Follow up' });
  await logContact('lead', id, { at: new Date().toISOString(), by: 'Scott', how: 'note', note: 'Looked at photos' });
  assert.equal((await next(id)).on, workingDays(2), 'a note does not move it');
  await addEmail('lead', id, { dir: 'in', subject: 'Can you do Friday?', body: 'Thanks', at: new Date().toISOString() });
  assert.deepEqual(await next(id), { on: londonToday(), why: 'Reply to their email' });
  const work = await actionsFor(await owners(), ['dampscan']);
  const due = work.groups.find((g) => g.key === 'followups');
  assert.ok(due, JSON.stringify(work.groups.map((g) => g.key)));
  assert.equal(due.items[0].leadId, id);
  assert.match(due.items[0].what, /Reply to their email/);
  await addEmail('lead', id, { dir: 'out', subject: 'Re: Can you do Friday?', body: 'Yes', at: new Date(Date.now() + 1000).toISOString() });
  assert.equal((await next(id)).on, workingDays(2), 'our reply waits two working days');
  await logContact('lead', id, { at: new Date().toISOString(), by: 'Scott', how: 'text', note: 'Sent times' }, { next: 'none' });
  assert.deepEqual(await next(id), { on: null, why: null }, 'No follow-up clears it');
});

test('a to-do sits on an enquiry, and ChatGPT finds the enquiry by name', async () => {
  const s = await owners();
  const id = await lead('Lana', 'DA16 1SP');
  const out = await addTodo(s, { text: 'Send Lana the price for the camera check', leadId: id, forOwners: true });
  assert.equal(out.todo.leadId, id);
  assert.equal(out.todo.site, 'dampscan', 'the business follows the enquiry');
  assert.match(out.todo.customer, /Lana, DA16 1SP/);
  assert.equal((await todosFor(s, 'lead', id)).length, 1);
  const r = await TOOLS.find((t) => t.name === 'add_todo').run(s, { text: 'Ring Lana back about access', for: 'owners', customer: 'Lana DA16 1SP' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.todo.leadId, id);
  assert.equal((await todosFor(s, 'lead', id)).length, 2);
});
