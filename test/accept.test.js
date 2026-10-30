/**
 * Accepting a quote online, the price book and quote templates.
 *
 * Acceptance: only an open quote can be accepted, only once, with a typed
 * name and a tick; the price stops moving the moment it is; the address it
 * came from is kept only as a hash; and the owner is told without the
 * customer being named. The price book and templates: per business, changed
 * only by someone who manages it, and a template never crosses businesses.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'accept-test-secret-long-enough-xxxxx';
process.env.IP_SALT = 'accept-test-salt-long-enough';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const login = (await import('../lib/routes/auth/login.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;
const pricebook = (await import('../lib/routes/admin/pricebook.js')).default;
const publicQuote = (await import('../api/quote.js')).default;

const P = (pounds) => Math.round(pounds * 100);
function makeReq({ method = 'POST', url = '/api/admin/quoted', body, headers = {} } = {}) {
  return { method, url, body, headers: { host: 'vergeroofing.com', 'x-forwarded-for': '198.51.100.23', 'user-agent': 't', ...headers }, socket: { remoteAddress: '198.51.100.23' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function personWith(code, grants, level = 'manage') {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,false) returning id', [code, h]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  const raw = (await call(login, { url: '/api/auth/login', body: { code } })).getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const post = async (cookie, body) => (await call(quoted, { body, headers: { cookie } })).json();
const book = async (cookie, body) => call(pricebook, { url: '/api/admin/pricebook', body, headers: { cookie } });
const view = (t) => call(publicQuote, { method: 'GET', url: '/api/quote?t=' + encodeURIComponent(t) });
const accept = (body) => call(publicQuote, { method: 'POST', url: '/api/quote', body });

/* A quoted roofing job with a priced line and a customer link. */
async function openQuote(cookie) {
  const { job } = await post(cookie, { op: 'save', site: 'roofing', customerName: 'Mrs Patel', customerPostcode: 'BR6 0AA', status: 'quoted' });
  await post(cookie, { op: 'qline', id: job.id, kind: 'materials', description: 'Tiles', costPence: P(1000) });
  await post(cookie, { op: 'markup', id: job.id, markupBp: 5000 });
  const url = (await post(cookie, { op: 'quotelink', id: job.id })).job.quote.url;
  return { id: job.id, token: new URL(url).searchParams.get('t') };
}

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts, quote_lines, job_messages, notifications, price_items, quote_templates restart identity cascade');
});
after(async () => { await pool.end(); });

/* -------------------------------------------------------- acceptance ---- */
test('a customer accepts with their name and a tick, once, and the price stops moving', async () => {
  const cookie = await personWith('verge-code', ['roofing']);
  const { id, token } = await openQuote(cookie);
  assert.equal((await view(token)).json().quote.acceptable, true);

  assert.equal((await accept({ t: token, name: 'A', agree: true })).statusCode, 400, 'a name, not an initial');
  assert.equal((await accept({ t: token, name: 'Anita Patel' })).statusCode, 400, 'the tick is required');
  assert.equal((await accept({ t: token, name: 'Anita Patel', agree: true })).statusCode, 200);
  assert.equal((await accept({ t: token, name: 'Anita Patel', agree: true })).statusCode, 409, 'not twice');

  const seen = (await view(token)).json().quote;
  assert.equal(seen.accepted, true);
  assert.equal(seen.acceptable, false);
  assert.equal(seen.acceptedName, 'Anita Patel');
  assert.equal(seen.netPence, P(1500));

  /* A line added after acceptance moves the margin, not the agreed price. */
  const job = (await post(cookie, { op: 'qline', id, kind: 'other', description: 'Extra lead', costPence: P(200) })).job;
  assert.equal(job.invoiceNetPence, P(1500));
  assert.equal(job.quote.driving, false);
  assert.equal(job.quote.accepted.name, 'Anita Patel');
  assert.equal(job.status, 'quoted', 'it waits for staff to book a date');
  assert.equal((await view(token)).json().quote.netPence, P(1500));

  const row = (await pool.query('select quote_accepted_ip_hash from jobs where id = $1', [id])).rows[0];
  assert.match(row.quote_accepted_ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!row.quote_accepted_ip_hash.includes('198.51.100.23'), 'never the raw address');

  const told = (await pool.query("select title, message from notifications where kind = 'quote_accepted'")).rows;
  assert.equal(told.length, 1);
  assert.equal(told[0].title, 'Quote accepted: Verge Roofing');
  assert.equal(told[0].message, 'A customer in BR6 accepted the £1,500 quote online. Call to book a start date.');
  assert.ok(!/Patel|0AA/.test(told[0].title + told[0].message), 'a surname or full postcode never goes on a lock screen');
});

test('a declined, expired, unpriced or unknown quote cannot be accepted', async () => {
  const cookie = await personWith('verge-code', ['roofing']);
  const declined = await openQuote(cookie);
  await post(cookie, { op: 'save', id: declined.id, site: 'roofing', customerName: 'X', status: 'declined' });
  assert.equal((await accept({ t: declined.token, name: 'Anita Patel', agree: true })).statusCode, 409);

  const old = await openQuote(cookie);
  await pool.query(`update jobs set created_at = now() - interval '40 days', quote_sent_at = now() - interval '40 days' where id = $1`, [old.id]);
  assert.equal((await view(old.token)).json().quote.expired, true);
  assert.equal((await accept({ t: old.token, name: 'Anita Patel', agree: true })).statusCode, 409);

  const { job } = await post(cookie, { op: 'save', site: 'roofing', customerName: 'Y', status: 'quoted' });
  const empty = new URL((await post(cookie, { op: 'quotelink', id: job.id })).job.quote.url).searchParams.get('t');
  assert.equal((await accept({ t: empty, name: 'Anita Patel', agree: true })).statusCode, 409, 'nothing priced, nothing to accept');

  assert.equal((await accept({ t: 'not-a-real-token-at-all-xx', name: 'Anita Patel', agree: true })).statusCode, 404);
});

/* -------------------------------------------- price book and templates ---- */
test('the price book belongs to its business and only a manager changes it', async () => {
  const manager = await personWith('verge-code', ['roofing']);
  const worker = await personWith('verge-worker', ['roofing'], 'work');
  const cool = await personWith('cool-code', ['ac']);
  const added = await book(manager, { op: 'item', site: 'roofing', kind: 'materials', description: 'Redland 49 tile', unit: 'm²', costPence: P(18.5) });
  assert.equal(added.statusCode, 200);
  assert.deepEqual(added.json().items.map((i) => [i.description, i.unit, i.costPence]), [['Redland 49 tile', 'm²', P(18.5)]]);

  assert.equal((await book(worker, { op: 'item', site: 'roofing', kind: 'materials', description: 'X', costPence: 1 })).statusCode, 403);
  const read = await call(pricebook, { method: 'GET', url: '/api/admin/pricebook?site=roofing', headers: { cookie: worker } });
  assert.equal(read.json().items.length, 1, 'a worker can still read it');
  assert.equal(read.json().canManage, false);
  assert.equal((await call(pricebook, { method: 'GET', url: '/api/admin/pricebook?site=roofing', headers: { cookie: cool } })).statusCode, 403);
  assert.equal((await book(manager, { op: 'item', site: 'roofing', kind: 'bribes', description: 'X', costPence: 1 })).statusCode, 400);

  const id = added.json().items[0].id;
  assert.deepEqual((await book(manager, { op: 'unitem', site: 'roofing', id })).json().items, []);
});

test('a quote saved as a template fills another quote, and never one in another business', async () => {
  const cookie = await personWith('both-code', ['roofing', 'ac']);
  const first = await openQuote(cookie);
  await post(cookie, { op: 'qline', id: first.id, kind: 'labour', description: 'Two days', costPence: P(500) });
  const saved = (await book(cookie, { op: 'template', site: 'roofing', jobId: first.id, name: 'Small re-roof' })).json();
  assert.deepEqual(saved.templates.map((t) => [t.name, t.lineCount, t.costPence, t.markupBp]), [['Small re-roof', 2, P(1500), 5000]]);
  const templateId = saved.templates[0].id;

  const { job } = await post(cookie, { op: 'save', site: 'roofing', customerName: 'Next', status: 'quoted' });
  const filled = (await post(cookie, { op: 'fromtemplate', id: job.id, templateId })).job;
  assert.deepEqual(filled.quote.lines.map((l) => [l.kind, l.description, l.costPence]), [['materials', 'Tiles', P(1000)], ['labour', 'Two days', P(500)]]);
  assert.equal(filled.quote.markupBp, 5000);
  assert.equal(filled.invoiceNetPence, P(2250));

  const ac = (await post(cookie, { op: 'save', site: 'ac', customerName: 'Cool', status: 'quoted' })).job;
  assert.equal((await post(cookie, { op: 'fromtemplate', id: ac.id, templateId })).ok, false, 'a roofing template is not an air conditioning one');
  assert.equal((await book(cookie, { op: 'template', site: 'ac', jobId: first.id, name: 'Stolen' })).statusCode, 404, 'nor saved across');
});
