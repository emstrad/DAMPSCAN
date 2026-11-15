/**
 * The Company hub end to end through its real routes and real sign-ins
 * (the owners' plan, 15 Nov 2026): only Scott and Tom (the owners' code, or
 * managing both damp brands) see or change anything; a surveyor and someone
 * managing one brand are refused; a receipt is the owners' alone.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'company-test-secret-long-enough-xxxx';
process.env.IP_SALT = 'company-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';
delete process.env.BLOB_READ_WRITE_TOKEN;

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const login = (await import('../lib/routes/auth/login.js')).default;
const pay = (await import('../lib/routes/admin/pay.js')).default;
const attachment = (await import('../lib/routes/admin/attachment.js')).default;

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(p) { this.writableEnded = true; this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, { method = 'GET', url = '/', body, cookie, type } = {}) {
  const headers = { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'test', accept: 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (type) headers['content-type'] = type;
  const res = makeRes();
  await handler({ method, url, body, headers, socket: { remoteAddress: '203.0.113.9' } }, res);
  return res;
}
async function signIn(code) {
  const res = await call(login, { method: 'POST', body: { code } });
  assert.equal(res.statusCode, 200, res.body);
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
async function person(name, code, grants) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const id = (await pool.query('insert into people (name, passcode_hash) values ($1, $2) returning id', [name, h])).rows[0].id;
  for (const [slug, level] of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [id, slug, level]);
  return signIn(code);
}

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, people, audit, rate_hits, paid_out, expenses restart identity cascade'); });
after(async () => { await pool.end(); });

const VIEWS = ['/api/admin/pay', '/api/admin/pay?view=overview', '/api/admin/pay?view=growth', '/api/admin/pay?view=money', '/api/admin/pay?who=ronnie'];

test('the owners and Tom (managing both brands) use every tab; a surveyor, a one-brand manager and nobody are refused', async () => {
  const owners = await signIn('1290');
  const tom = await person('Tom', '481516', [['dampscan', 'manage'], ['ati-london', 'manage']]);
  const ben = await person('Ben', '232342', [['dampscan', 'work'], ['ati-london', 'work']]);
  const one = await person('Sam', '777888', [['dampscan', 'manage']]);
  for (const url of VIEWS) {
    assert.equal((await call(pay, { url, cookie: owners })).statusCode, 200, url);
    assert.equal((await call(pay, { url, cookie: tom })).statusCode, 200, url);
    assert.equal((await call(pay, { url, cookie: ben })).statusCode, 403, url);
    assert.equal((await call(pay, { url, cookie: one })).statusCode, 403, url);
    assert.equal((await call(pay, { url })).statusCode, 401, url);
  }
  for (const body of [{ op: 'expense', pence: 1000, category: 'Software' }, { op: 'pay', who: 'ben', pence: 1000 }]) {
    assert.equal((await call(pay, { method: 'POST', url: '/api/admin/pay', body, cookie: ben })).statusCode, 403);
  }
  assert.equal((await call(pay, { method: 'POST', url: '/api/admin/pay?op=tide', body: 'Date,Description,Amount\n2026-11-03,X,-1\n', type: 'text/csv', cookie: ben })).statusCode, 403);
  assert.equal(Number((await pool.query('select count(*) from expenses')).rows[0].count), 0, 'nothing written by a refused request');
});

test('an owner logs a cost with its receipt, checks a statement, and puts a line right; bad input is a 400', async () => {
  const owners = await signIn('1290');
  const add = await call(pay, { method: 'POST', url: '/api/admin/pay', cookie: owners, body: { op: 'expense', pence: 25000, day: '2026-11-07', category: 'Google Ads', receipt: 'leads/2026-11-07/0b1c-receipt.pdf' } });
  assert.equal(add.statusCode, 200, add.body);
  const csv = 'Date,Transaction description,Reference,Paid in,Paid out\n07/11/2026,GOOGLE ADS,,,250.00\n09/11/2026,VERCEL INC,,,16.00\n';
  const check = (await call(pay, { method: 'POST', url: '/api/admin/pay?op=tide', body: csv, type: 'text/csv', cookie: owners })).json();
  assert.equal(check.ok, true);
  const vercel = check.lines.find((l) => l.what === 'VERCEL INC');
  assert.equal(check.lines.find((l) => l.what === 'GOOGLE ADS').status, 'matched');
  assert.equal(vercel.status, 'missing');
  assert.equal(vercel.guess, 'cost:Software');
  assert.equal((await call(pay, { method: 'POST', url: '/api/admin/pay', cookie: owners, body: { op: 'expense', pence: 1600, day: vercel.day, category: 'Software', bankRef: vercel.ref } })).statusCode, 200);
  const again = (await call(pay, { method: 'POST', url: '/api/admin/pay?op=tide', body: csv, type: 'text/csv', cookie: owners })).json();
  assert.equal(again.totals.matched, 2);
  for (const body of [{ op: 'unexpense', id: 'abc' }, { op: 'remove', id: null }, { op: 'expense', pence: -5, category: 'Software' }, { op: 'nope' }]) {
    assert.equal((await call(pay, { method: 'POST', url: '/api/admin/pay', cookie: owners, body })).statusCode, 400, JSON.stringify(body));
  }
  assert.equal((await call(pay, { method: 'POST', url: '/api/admin/pay?op=tide', body: 'Name,Colour\nKim,Blue\n', type: 'text/csv', cookie: owners })).statusCode, 400);
});

test('a receipt is the owners\' alone: a surveyor with DampScan access cannot open it', async () => {
  const owners = await signIn('1290');
  const ben = await person('Ben', '232342', [['dampscan', 'work'], ['ati-london', 'work']]);
  await pool.query("insert into expenses (amount_pence, category, receipt_path) values (5000, 'Equipment', 'leads/2026-11-07/0b1c-receipt.pdf')");
  const url = '/api/admin/attachment?path=' + encodeURIComponent('leads/2026-11-07/0b1c-receipt.pdf');
  const worker = await call(attachment, { url, cookie: ben });
  assert.equal(worker.statusCode, 404);
  const owner = await call(attachment, { url, cookie: owners });
  assert.notEqual(owner.json().error, 'not_found', 'the owner gets past the check (no file store in tests)');
});
