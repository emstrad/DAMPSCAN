/**
 * The to-do list as the owners use it. Scott signs in with the shared owners'
 * code, which has no people row, both in the staff app and through ChatGPT;
 * Tom has his own login. Regression tests for: a note "for Scott" also
 * landing on the list of whoever set it, the owners' code having no "me" in
 * the staff form, "everyone" and "for Scott" being shown the same, and the
 * assistant's answer not saying plainly what it did.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'todos-owners-test-secret-long-enough-xx';
process.env.IP_SALT = 'todos-owners-test-salt-long-enough';
delete process.env.NTFY_TOPIC;
delete process.env.OWNER_NAMES;

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { callRoute } = await import('../lib/mcp/shared.js');
const { callTool } = await import('../lib/routes/admin/mcp.js');
const todosRoute = (await import('../lib/routes/admin/todos.js')).default;
const { scopeFor } = await import('../lib/access.js');
const { digestCounts } = await import('../lib/todos.js');

async function person(name, grants) {
  const { rows } = await pool.query('insert into people (name, passcode_hash) values ($1, $2) returning id', [name, 'x']);
  for (const slug of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [rows[0].id, slug, 'manage']);
  return scopeFor({ person: true, sub: Number(rows[0].id) });
}
/* The browser's shared-code session is named "Staff"; the connector's "Owners". */
const browserOwners = () => scopeFor({ person: false, name: 'Staff' });
const chatOwners = async () => ({ ...(await scopeFor({ person: false, name: 'Owners' })), viaAssistant: true });
const post = (scope, body) => callRoute(todosRoute, scope, { method: 'POST', url: '/api/admin/todos', body });
const view = async (scope, v) => (await callRoute(todosRoute, scope, { url: '/api/admin/todos?view=' + v })).data.todos.map((t) => `${t.text}|${t.forName}`).sort();
const chat = (scope, name, args) => callTool(scope, { name, arguments: args });

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate todos, jobs, people, audit, push_subscriptions restart identity cascade'); });
after(async () => { await pool.end(); });

test('the owners\' code adds by hand in the staff app: for me, for Tom, for everyone, under a business', async () => {
  const tom = await person('Tom', ['roofing']);
  const owners = await browserOwners();
  const got = (await callRoute(todosRoute, owners, { url: '/api/admin/todos?view=open' })).data;
  assert.equal(got.owners, 'Scott', 'the form can offer Scott (me)');
  assert.deepEqual(got.people.map((p) => p.name), ['Tom']);

  for (const body of [
    { op: 'add', text: 'Mine', forPersonId: 'owners' },
    { op: 'add', text: 'For Tom', forPersonId: tom.personId, dueOn: '2026-12-01' },
    { op: 'add', text: 'For all', forPersonId: null, dueOn: '' },
    { op: 'add', text: 'Roofing for me', forPersonId: 'owners', site: 'roofing' }
  ]) {
    const r = await post(owners, body);
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  assert.equal((await post(owners, { op: 'add', text: '  ' })).status, 400);
  assert.equal((await pool.query("select set_by_name from todos where text = 'Mine'")).rows[0].set_by_name, 'Owners', 'not "Staff"');

  assert.deepEqual(await view(owners, 'open'), ['For all|Everyone', 'Mine|Scott', 'Roofing for me|Scott']);
  assert.deepEqual(await view(owners, 'mine'), ['Mine|Scott', 'Roofing for me|Scott']);
  assert.deepEqual(await view(owners, 'set'), ['For Tom|Tom', 'For all|Everyone', 'Mine|Scott', 'Roofing for me|Scott']);
  assert.deepEqual(await view(owners, 'failed'), []);
  assert.deepEqual(await view(tom, 'open'), ['For Tom|Tom'], 'the owners\' own items are not on Tom\'s list');

  const id = (await pool.query("select id from todos where text = 'Mine'")).rows[0].id;
  assert.equal((await post(owners, { op: 'done', id: Number(id) })).status, 200);
  assert.deepEqual(await view(owners, 'done'), ['Mine|Scott']);
  assert.equal((await post(owners, { op: 'reopen', id: Number(id) })).status, 200);
  assert.deepEqual(await view(owners, 'done'), []);
});

test('Tom\'s note for Scott is on Scott\'s list, not on Tom\'s own', async () => {
  const tom = await person('Tom', ['roofing']);
  const owners = await browserOwners();
  const r = await chat(tom, 'add_todo', { text: 'Laura next week', for: 'Scott' });
  assert.equal(r.isError, false);
  assert.equal(r.content[0].text, 'Added to Scott\'s to-do list.');
  assert.deepEqual(await view(tom, 'open'), []);
  assert.deepEqual(await view(tom, 'set'), ['Laura next week|Scott']);
  assert.deepEqual(await view(owners, 'mine'), ['Laura next week|Scott']);
  await chat(tom, 'add_todo', { text: 'Van MOT', for: 'everyone' });
  assert.deepEqual(await view(tom, 'open'), ['Van MOT|Everyone']);
  const counts = (await digestCounts('roofing')).map((c) => `${c.name} ${c.open}`);
  assert.deepEqual(counts, ['Everyone 1', 'Scott 1']);
});

test('ChatGPT on the owners\' code: each way of saying who, a clear answer, and it is on Scott\'s list', async () => {
  const tom = await person('Tom', ['roofing']);
  await pool.query(`insert into jobs (site, status, invoice_net_pence, survey_price_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp, customer_name, customer_postcode)
    values ('roofing', 'quoted', 0, 0, 0, 0, '', '', '', 1900, 1000, 0, 5000, 'Laura Smith', 'BR6 1AA')`);
  const owners = await chatOwners();
  const said = async (args) => {
    const r = await chat(owners, 'add_todo', args);
    assert.equal(r.isError, false, r.content.map((c) => c.text).join(' '));
    return r.content[0].text;
  };
  assert.equal(await said({ text: 'Ring the bank', for: 'me' }), 'Added to Scott\'s to-do list.');
  assert.equal(await said({ text: 'Order slates', for: 'Scott', business: 'roofing' }), 'Added to Scott\'s to-do list.');
  assert.equal(await said({ text: 'Check the ladder', for: 'Tom' }), 'Added to Tom\'s to-do list.');
  assert.equal(await said({ text: 'Team meal', for: 'everyone' }), 'Added to everyone\'s to-do list.');
  assert.equal(await said({ text: 'Ring Laura back', for: 'Tom', customer: 'Laura BR6' }), 'Added to Tom\'s to-do list (Laura Smith, BR6 1AA).');
  assert.equal(await said({ text: 'Skip for Laura' }), 'Added to Scott\'s to-do list.');
  assert.equal(await said({ text: 'Both of us', for: 'Scott and Tom' }), 'Added to Scott\'s to-do list. Added to Tom\'s to-do list.');

  const listed = (await chat(owners, 'list_todos', {})).structuredContent.todos.map((t) => `${t.text}|${t.forName}`).sort();
  assert.deepEqual(listed, ['Both of us|Scott', 'Order slates|Scott', 'Ring the bank|Scott', 'Skip for Laura|Scott', 'Team meal|Everyone']);
  assert.equal((await chat(owners, 'list_todos', { view: 'mine' })).structuredContent.count, 4);
  const toms = (await chat(tom, 'list_todos', {})).structuredContent.todos.map((t) => t.text).sort();
  assert.deepEqual(toms, ['Both of us', 'Check the ladder', 'Ring Laura back']);

  assert.equal((await chat(owners, 'complete_todo', { text: 'slates' })).isError, false);
  assert.equal((await chat(owners, 'list_todos', { view: 'done' })).structuredContent.count, 1);
  assert.equal((await chat(owners, 'reopen_todo', { text: 'slates' })).isError, false);
  /* A to-do with no customer never borrows the stage of a job that shares its number. */
  const slates = (await pool.query("select id from todos where text = 'Order slates'")).rows[0].id;
  await pool.query(`insert into jobs (id, site, status, survey_price_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp, customer_name, customer_postcode, date_set, paid_at)
    overriding system value values ($1, 'dampscan', 'paid', 29500, 0, 0, '', '', '', 0, 0, 0, 5000, 'Pat Doe', 'ME19 6AB', false, now()) on conflict (id) do nothing`, [slates]).catch(() => {});
  const ticked = await chat(owners, 'complete_todo', { id: Number(slates) });
  assert.equal(ticked.structuredContent.scheduler, undefined);
  await chat(owners, 'reopen_todo', { id: Number(slates) });

  const bad = await chat(owners, 'add_todo', { text: 'x', for: 'Tom and Zed' });
  assert.equal(bad.isError, true);
  assert.match(bad.structuredContent.error, /Nobody called Zed.*Already done: Added to Tom's to-do list/);
  assert.equal(Number((await pool.query("select count(*) from todos where source = 'failed'")).rows[0].count), 0, 'to-do tools are not saved as failures');
});
