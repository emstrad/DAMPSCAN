/**
 * One phone alert per staff change, saying who did what, never to whom.
 *
 * ntfy is a stubbed fetch. The change goes through the same dispatcher the
 * browser uses, and through callRoute as the assistant does; a request that
 * already sent its own alert is not announced twice, and ntfy being down
 * never fails the save.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'activity-test-secret-long-enough-xx';
process.env.IP_SALT = 'notify-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';
process.env.CRON_SECRET = 'a-cron-secret-that-is-long-enough';
/* Change alerts reach ntfy only when switched on; these tests check what they say. */
process.env.ACTIVITY_PUSH = 'on';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

/* ntfy, stubbed: every publish is kept, and it can be told to fail. */
let pushes = [];
let ntfyDown = false;
globalThis.fetch = async (url, init) => {
  if (ntfyDown) throw new Error('ntfy unreachable');
  pushes.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  return { ok: true, status: 200 };
};

const login = (await import('../lib/routes/auth/login.js')).default;
const admin = (await import('../api/admin/[action].js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;
const { callRoute } = await import('../lib/mcp/shared.js');
const { scopeFor } = await import('../lib/access.js');
const { addTodo, setDone } = await import('../lib/todos.js');

const P = (pounds) => Math.round(pounds * 100);
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, { method = 'POST', url = '/api/admin/quoted', body, headers = {} }) {
  const req = { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.7', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.7' } };
  const res = makeRes();
  await handler(req, res);
  return res;
}
async function person(name, code) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,false) returning id', [name, h]);
  await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [rows[0].id, 'roofing', 'manage']);
  const raw = (await call(login, { url: '/api/auth/login', body: { code } })).getHeader('set-cookie');
  return { id: Number(rows[0].id), cookie: (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0] };
}
const post = (cookie, body) => call(admin, { body, headers: { cookie } });
const CUSTOMER = 'Priya Sharma';
const said = () => pushes.map((p) => p.body.message);

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, people, audit, job_costs, job_payments, notifications, todos restart identity cascade');
  pushes = [];
  ntfyDown = false;
  process.env.NTFY_TOPIC = 'dampscan-test-topic';
});
after(async () => { await pool.end(); });

test('a cost added on the screen is one alert naming who, the job and the amount, never the customer', async () => {
  const tom = await person('Tom', 'tom-code-1');
  const job = (await post(tom.cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, customerPostcode: 'BR1 1AA', invoiceNetPence: P(5000), status: 'booked' })).json().job;
  assert.equal(pushes.length, 1, 'the new job has its own alert, not a second one');
  pushes = [];
  await post(tom.cookie, { op: 'cost', id: job.id, label: 'Skip for Priya Sharma', amountPence: P(260) });
  assert.deepEqual(said(), ['Added a £260 cost to Priya, BR1.']);
  assert.equal(pushes[0].body.title, 'Verge Roofing: Tom');
  assert.equal(pushes[0].body.priority, 3, 'staff activity shows as a normal alert');
  assert.deepEqual(pushes[0].body.tags, ['receipt']);
  assert.equal(pushes[0].body.click, `https://dampscan.co.uk/staff/quoted.html?area=roofing#job-${job.id}`);
  pushes = [];
  await post(tom.cookie, { op: 'payment', id: job.id, amountPence: P(100), paidOn: '2026-01-01' });
  assert.equal(pushes.length, 1, 'a payment is told once, by its own alert');
  assert.ok(pushes.every((p) => !JSON.stringify(p.body).includes('Sharma') && !JSON.stringify(p.body).includes('1AA')));
});

test('the assistant\'s changes are marked, and ntfy being down never fails a save', async () => {
  const tom = await person('Tom', 'tom-code-2');
  const job = (await post(tom.cookie, { op: 'save', site: 'roofing', customerName: CUSTOMER, invoiceNetPence: P(5000), status: 'booked' })).json().job;
  pushes = [];
  const scope = { ...(await scopeFor({ person: true, sub: tom.id })), viaAssistant: true };
  const r = await callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: { op: 'qline', id: job.id, kind: 'materials', description: 'Tiles', costPence: P(1000) } });
  assert.equal(r.status, 200);
  assert.deepEqual(said(), ['Added a £1,000 quote line to Priya.']);
  /* A second change to the same job within the minute replaces the held alert with both. */
  const r2 = await callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: { op: 'cost', id: job.id, label: 'Skip', amountPence: P(260) } });
  assert.equal(r2.status, 200);
  const last = pushes[pushes.length - 1].body;
  assert.equal(last.sequence_id, `job-${job.id}`);
  assert.equal(last.delay, '1m');
  assert.equal(last.message, 'Added a £1,000 quote line to Priya. Added a £260 cost to Priya.');
  ntfyDown = true;
  assert.equal((await post(tom.cookie, { op: 'cost', id: job.id, label: 'Skip', amountPence: P(260) })).statusCode, 200);
});

test('to-dos say who did what for whom, never the words', async () => {
  const tom = await person('Tom', 'tom-code-3');
  const scott = await person('Scott', 'scott-code-3');
  const tomScope = await scopeFor({ person: true, sub: tom.id });
  const scottScope = await scopeFor({ person: true, sub: scott.id });
  const { todo } = await addTodo(tomScope, { text: 'Ring Priya Sharma about the gutter', forPersonId: scott.id });
  await setDone(scottScope, todo.id, true);
  await setDone(scottScope, todo.id, false);
  assert.deepEqual(pushes.map((p) => p.body.title), ['To-do for Scott from Tom', 'To-do done: Scott', 'To-do reopened: Scott']);
  assert.deepEqual(said(), ['Open the to-do list to read it.', 'Scott ticked off a to-do set by Tom.', 'Scott reopened a to-do set by Tom.']);
  assert.ok(pushes.every((p) => p.body.click.startsWith('https://dampscan.co.uk/staff/calendar.html')));
  assert.ok(!JSON.stringify(pushes).includes('Priya'));
});
