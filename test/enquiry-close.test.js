/**
 * Closing, reopening and deleting website enquiries (lib/lead-status.js), from
 * the Leads route and the assistant's tools, and that a closed enquiry stops
 * nagging: no call-back, no half-finished alert, no weekly partial.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'enquiry-close-secret-long-enough-xxxxxx';
delete process.env.NTFY_TOPIC;

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});
globalThis.fetch = async () => ({ ok: true, status: 200 });

const { TOOLS } = await import('../lib/mcp/tools.js');
const { callRoute } = await import('../lib/mcp/shared.js');
const leadsRoute = (await import('../lib/routes/admin/leads.js')).default;
const { alertPartials } = await import('../lib/daily-alerts.js');
const { weekFigures } = await import('../lib/weekly-summary.js');
const { enquiries } = await import('../lib/due-sections.js');
const { scopeFor } = await import('../lib/access.js');

async function person(name, level, site = 'roofing') {
  const { rows } = await pool.query('insert into people (name, passcode_hash) values ($1, $2) returning id', [name, 'x']);
  await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [rows[0].id, site, level]);
  return scopeFor({ person: true, sub: Number(rows[0].id) });
}
async function lead({ site = 'roofing', stage = 'complete', name = 'Sarah', email = 'sarah@example.com', postcode = 'BR6 8AB', age = '2 hours' } = {}) {
  const { rows } = await pool.query(
    `insert into leads (site, stage, first_name, email, postcode, session_id, created_at)
     values ($1, $2, $3, $4, $5, gen_random_uuid(), now() - $6::interval) returning id`, [site, stage, name, email, postcode, age]);
  return Number(rows[0].id);
}
const run = async (scope, name, args = {}) => TOOLS.find((t) => t.name === name).run(scope, args);
const post = (scope, body) => callRoute(leadsRoute, scope, { method: 'POST', url: '/api/admin/leads', body });
const list = (scope, q = '') => callRoute(leadsRoute, scope, { url: '/api/admin/leads?range=all' + q });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, jobs, people, audit, notifications restart identity cascade'); });
after(async () => { await pool.end(); });

test('close with a reason, filter by status, reopen; all audited with who', async () => {
  /* Leads lists only for managers: a work login is refused (lib/routes/admin/leads.js). */
  const tom = await person('Tom', 'manage');
  const id = await lead();
  const other = await lead({ name: 'Ola', email: 'o@x.com' });
  const closed = await post(tom, { op: 'close', id, reason: 'booked elsewhere' });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const row = (await pool.query('select * from leads where id = $1', [id])).rows[0];
  assert.equal(row.closed_reason, 'booked elsewhere');
  assert.equal(row.closed_by, 'Tom');
  assert.ok(row.closed_at);

  const all = (await list(tom)).data;
  assert.equal(all.total, 2, 'default still lists everything');
  assert.equal(all.leads.find((l) => l.id === String(id) || Number(l.id) === id).status, 'closed');
  assert.deepEqual((await list(tom, '&status=open')).data.leads.map((l) => Number(l.id)), [other]);
  assert.equal((await list(tom, '&status=closed')).data.total, 1);

  assert.equal((await post(tom, { op: 'reopen', id })).status, 200);
  assert.equal((await pool.query('select closed_at from leads where id = $1', [id])).rows[0].closed_at, null);
  const audit = (await pool.query("select action from audit where entity = 'lead' order by id")).rows.map((r) => r.action);
  assert.deepEqual(audit, ['close', 'reopen']);
});

test('converted wins, scope holds, and delete is managers only and never for a converted enquiry', async () => {
  const tom = await person('Tom', 'work');
  const scott = await person('Scott', 'manage');
  const damp = await lead({ site: 'dampscan' });
  assert.equal((await post(tom, { op: 'close', id: damp })).status, 404, 'not his business');

  const spam = await lead({ name: 'Spam', email: 'spam@x.com' });
  assert.equal((await post(tom, { op: 'delete', id: spam })).status, 403);
  assert.equal((await post(scott, { op: 'delete', id: spam })).status, 200);
  assert.equal((await pool.query('select count(*) from leads where id = $1', [spam])).rows[0].count, '0');
  const gone = (await pool.query("select before_json from audit where action = 'delete'")).rows[0].before_json;
  assert.equal(gone.first_name, 'Spam', 'whole lead kept in the audit');

  const won = await lead({ name: 'Won', email: 'won@x.com' });
  await pool.query(`insert into jobs (site, customer_name, status, invoice_net_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b, lead_id)
                    values ('roofing', 'Won', 'booked', 0, 0, 0, 'x', 'x', 'x', $1)`, [won]);
  assert.equal((await post(scott, { op: 'delete', id: won })).status, 409);
  assert.equal((await list(scott, '&status=converted')).data.leads.length, 1);
});

test('assistant: close by words, ambiguity returns candidates, list_enquiries takes status', async () => {
  const scott = await person('Scott', 'manage');
  const a = await lead({ name: 'Sarah Jones', email: 'sj@x.com', postcode: 'BR6 8AB' });
  await lead({ name: 'Sarah Smith', email: 'ss@x.com', postcode: 'DA1 1AA' });
  const vague = await run(scott, 'close_enquiry', { enquiry: 'Sarah', reason: 'spam' });
  assert.equal(vague.status, 400);
  assert.equal(vague.data.matches.length, 2);
  const done = await run(scott, 'close_enquiry', { enquiry: 'Sarah BR6', reason: 'not interested' });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal((await pool.query('select closed_reason from leads where id = $1', [a])).rows[0].closed_reason, 'not interested');
  assert.equal((await run(scott, 'list_enquiries', { range: 'all', status: 'open' })).data.leads.length, 1);
  assert.equal((await run(scott, 'find_enquiry', { text: 'sj@x.com' })).data.enquiries[0].status, 'closed');
  assert.equal((await run(scott, 'reopen_enquiry', { enquiry: 'Jones' })).status, 200);
  assert.equal((await run(scott, 'delete_enquiry', { enquiry: 'Smith' })).status, 200);
});

test('a closed enquiry stops nagging: no call-back, no half-finished alert, no weekly partial', async () => {
  const scott = await person('Scott', 'manage');
  const done = await lead();
  const half = await lead({ stage: 'partial', email: 'half@x.com' });
  for (const id of [done, half]) await post(scott, { op: 'close', id, reason: 'no response' });
  assert.deepEqual(await enquiries(['roofing']), []);
  assert.equal(await alertPartials(), 0);
  const week = await weekFigures({ slug: 'roofing', payout_model: 'quoted' });
  assert.equal(Number(week.partials ?? 0), 0);
});
