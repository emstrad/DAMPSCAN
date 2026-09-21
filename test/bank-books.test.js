/**
 * The bank as books per business, through the real routes over Postgres.
 *
 * Damp's books are what the bank always was and its own tests still cover
 * them. These are the other books: a roofing statement lands in roofing's,
 * matches a roofing job, writes the job's payment, and reconciles to the penny
 * through a freeze; its split targets are its own people; the same line can
 * sit in two sets of books; and a worker cannot open the bank at all.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';
import { businessCsv } from './fixtures/revolut-csv.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'books-test-secret-long-enough-xxxxx';
process.env.IP_SALT = 'books-test-salt';
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
const bank = (await import('../lib/routes/admin/bank.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;

const P = (pounds) => Math.round(pounds * 100);
function makeReq({ method = 'POST', url = '/', body, headers = {} } = {}) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.9' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function person(name, code, grants, isAdmin = false, level = 'work') {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  return Number(rows[0].id);
}
async function signIn(code) {
  const res = await call(login, { url: '/api/auth/login', body: { code } });
  assert.equal(res.statusCode, 200, res.body);
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const get = (cookie, qs = '') => call(bank, { method: 'GET', url: `/api/admin/bank${qs}`, headers: { cookie } });
const post = (cookie, body, qs = '') => call(bank, { method: 'POST', url: `/api/admin/bank${qs}`, headers: { cookie }, body });
const upload = (cookie, csv, qs) => call(bank, { method: 'POST', url: `/api/admin/bank?op=import&name=s.csv${qs}`, headers: { cookie, 'content-type': 'text/csv' }, body: csv });
const job = (cookie, body) => call(quoted, { url: '/api/admin/quoted', body, headers: { cookie } });
const today = new Date().toISOString().slice(0, 10);

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, bank_statements, bank_transactions, bank_rules, job_costs, job_owner_days, job_payments, payouts restart identity cascade');
});
after(async () => { await pool.end(); });

/* Scott holds everything; Steve holds roofing only. */
async function team() {
  const scott = await person('Scott Nelson', 'scott-code', ['dampscan', 'ati-london', 'roofing', 'ac'], true, 'manage');
  const tom = await person('Tom Smith', 'tom-code', ['roofing', 'ac'], false, 'manage');
  const steve = await person('Steve Brown', 'steve-code', ['roofing']);
  return { scott, tom, steve, cookie: await signIn('scott-code') };
}

/* The month in roofing's account: the customer pays, Steve draws, HMRC is
   paid, and materials go on the card. */
const ROOFING = [
  { date: today, id: 'r-in', type: 'TRANSFER', description: 'Payment from PRIYA SHARMA', payer: 'PRIYA SHARMA', reference: 'BR1 1AA', amount: 3000 },
  { date: today, id: 'r-steve', type: 'TRANSFER', description: 'To Steve Brown', reference: 'Drawings', amount: -500 },
  { date: today, id: 'r-hmrc', type: 'TRANSFER', description: 'To HMRC', reference: 'Corporation tax', amount: -100 },
  { date: today, id: 'r-tp', description: 'TRAVIS PERKINS BROMLEY', amount: -1000, mcc: '5211' }
];

test('the books a viewer may open: damp first with its four targets, each other business with its people', async () => {
  const { steve, tom, scott, cookie } = await team();
  const damp = (await get(cookie)).json();
  assert.equal(damp.books.key, 'damp');
  assert.deepEqual(damp.books.targets.map((t) => t.key), ['scott', 'tom', 'ben', 'tax']);
  assert.deepEqual(damp.allBooks.map((b) => b.key), ['damp', 'ac', 'roofing'], 'damp, then the others by name');
  const roofing = (await get(cookie, '?books=roofing')).json();
  assert.deepEqual(roofing.books.targets.map((t) => [t.key, t.name]), [[`p${scott}`, 'Scott Nelson'], [`p${steve}`, 'Steve Brown'], [`p${tom}`, 'Tom Smith'], ['tax', 'Tax pot']]);
  assert.equal(roofing.totals.model, 'quoted');
  assert.equal((await get(cookie, '?books=plumbing')).statusCode, 404);
  assert.equal((await get(await signIn('steve-code'))).statusCode, 403, 'the bank is admin only, whatever he holds');
});

test('a roofing statement lands in roofing\'s books, matches its job, writes the payment and splits to its own people', async () => {
  const { steve, cookie } = await team();
  const j = (await job(cookie, { op: 'save', site: 'roofing', customerName: 'Priya Sharma', customerPostcode: 'BR1 1AA', invoiceNetPence: P(3000), status: 'booked' })).json().job;
  const up = (await upload(cookie, businessCsv(ROOFING), '&books=roofing')).json();
  assert.equal(up.added, 4, JSON.stringify(up));
  assert.equal(up.matched, 1, 'the customer\'s payment found the job');

  const fresh = (await job(cookie, { op: 'cost', id: j.id, label: 'Materials', amountPence: P(1000) })).json().job;
  assert.equal(fresh.money.paidInFull, true);
  assert.deepEqual(fresh.payments.map((p) => [p.amountPence, p.label, p.fromBank, p.paidOn]), [[P(3000), 'payment', true, today]]);

  const by = Object.fromEntries((await get(cookie, '?books=roofing&view=all')).json().transactions.map((t) => [t.description, t]));
  assert.equal(by['Payment from PRIYA SHARMA'].jobId, j.id);
  assert.deepEqual(by['To Steve Brown'].split, [`p${steve}`], 'a transfer to a partner by name is his drawings, keyed by who he is');
  assert.equal(by['To Steve Brown'].shares[`p${steve}`], -P(500));
  assert.deepEqual(by['To HMRC'].split, ['tax']);
  assert.equal(by['TRAVIS PERKINS BROMLEY'].category, 'materials');
  assert.deepEqual(by['TRAVIS PERKINS BROMLEY'].split, [], 'a company cost is nobody\'s');

  assert.equal((await get(cookie, '?view=all')).json().transactions.length, 0, 'nothing of this reached damp\'s books');
  assert.equal((await get(cookie, '?books=roofing&view=attention')).json().transactions.length, 0, 'company spend with a category does not wait on anybody');
});

test('roofing\'s books reconcile through a freeze to the penny, and the company\'s rows are on the ledger', async () => {
  const { scott, steve, cookie } = await team();
  const j = (await job(cookie, { op: 'save', site: 'roofing', customerName: 'Priya Sharma', customerPostcode: 'BR1 1AA', invoiceNetPence: P(3000), status: 'booked', finderPersonId: scott })).json().job;
  await upload(cookie, businessCsv(ROOFING), '&books=roofing');
  await job(cookie, { op: 'cost', id: j.id, label: 'Materials', amountPence: P(1000) });
  const frozen = (await job(cookie, { op: 'freeze', id: j.id })).json();
  assert.equal(frozen.ok, true, JSON.stringify(frozen));
  /* 3000 - 1000 = 2000; reserve 380; fee base 1620; fee 81; kept 1539. */
  assert.deepEqual(frozen.job.frozen.company, { costsPence: P(1000), reservePence: P(380), retainedPence: P(1539) });
  assert.deepEqual(frozen.job.frozen.rows.map((r) => [r.key, r.amountPence]), [['finder', P(81)]], 'the company\'s rows are not shown as people');
  const ledger = (await pool.query('select person_key, amount_pence from payouts where job_id = $1 order by person_key', [j.id])).rows;
  assert.deepEqual(ledger.map((r) => [r.person_key, Number(r.amount_pence)]), [['costs', P(1000)], ['finder', P(81)], ['reserve', P(380)], ['retained', P(1539)]]);
  assert.equal(ledger.reduce((s, r) => s + Number(r.amount_pence), 0), P(3000), 'the ledger adds back to the invoice');

  const t = (await get(cookie, '?books=roofing')).json().totals;
  assert.equal(t.bank.netPence, P(1400));
  const person = (key) => t.people.find((p) => p.key === key);
  assert.equal(person(`p${scott}`).balancePence, P(81), 'Scott is owed his fee and has not been paid it');
  assert.equal(person(`p${steve}`).balancePence, -P(500), 'Steve drew 500 against nothing owed yet');
  assert.deepEqual(t.tax, { reservedPence: P(380), paidPence: -P(100), balancePence: P(280) });
  assert.equal(t.retainedPence, P(1539));
  assert.deepEqual(t.costs, { recordedPence: P(1000), fromBankPence: P(1000), unseenPence: 0 }, 'the materials were paid from the account and put on the job');
  assert.equal(t.jobs.paid, 1);
  assert.equal(t.differencePence, 0);
  assert.equal(t.explainedPence, t.bank.netPence, JSON.stringify(t));
});

test('a split in roofing\'s books takes its own people and refuses damp\'s names', async () => {
  const { steve, tom, cookie } = await team();
  await upload(cookie, businessCsv(ROOFING), '&books=roofing');
  const tp = (await get(cookie, '?books=roofing&view=out')).json().transactions.find((t) => t.description === 'TRAVIS PERKINS BROMLEY');
  const bad = await post(cookie, { id: tp.id, split: ['tom'] }, '?books=roofing');
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().errors.split, /Steve Brown/);
  const ok = (await post(cookie, { id: tp.id, split: [`p${tom}`, `p${steve}`] }, '?books=roofing')).json();
  assert.deepEqual(ok.transactions[0].shares, { [`p${tom}`]: -P(500), [`p${steve}`]: -P(500), [`p${(await pool.query('select id from people where name like \'Scott%\'')).rows[0].id}`]: 0, tax: 0 });
  assert.equal((await post(cookie, { id: tp.id, split: ['tax'] })).statusCode, 404, 'a roofing line is not in damp\'s books');
});

test('the same line in two sets of books is two lines, and unmatching takes only what the bank wrote', async () => {
  const { cookie } = await team();
  const j = (await job(cookie, { op: 'save', site: 'roofing', customerName: 'Priya Sharma', customerPostcode: 'BR1 1AA', invoiceNetPence: P(3000), status: 'booked' })).json().job;
  assert.equal((await upload(cookie, businessCsv(ROOFING), '&books=roofing')).json().added, 4);
  assert.equal((await upload(cookie, businessCsv(ROOFING), '')).json().added, 4, 'damp\'s books had not seen these fingerprints');
  assert.equal((await upload(cookie, businessCsv(ROOFING), '&books=roofing')).json().duplicates, 4, 'roofing\'s had');

  await job(cookie, { op: 'payment', id: j.id, amountPence: P(200), label: 'deposit' });
  const line = (await get(cookie, '?books=roofing&view=in')).json().transactions[0];
  const off = (await post(cookie, { id: line.id, jobId: null }, '?books=roofing')).json();
  assert.equal(off.transactions[0].jobId, null);
  const after = (await job(cookie, { op: 'save', id: j.id, site: 'roofing', customerName: 'Priya Sharma', invoiceNetPence: P(3000) })).json().job;
  assert.deepEqual(after.payments.map((p) => [p.amountPence, p.fromBank]), [[P(200), false]], 'the typed deposit stays, the bank\'s line goes');
  assert.equal(off.totals.unmatchedInPence, P(3000));
  assert.equal(off.totals.explainedPence, off.totals.bank.netPence);
});

test('a CoolRight freeze knows which person each half is', async () => {
  const { scott, tom, cookie } = await team();
  const j = (await job(cookie, { op: 'save', site: 'ac', customerName: 'Two splits', invoiceNetPence: P(2800) })).json().job;
  await job(cookie, { op: 'cost', id: j.id, label: 'Units', amountPence: P(1800) });
  await job(cookie, { op: 'payment', id: j.id, amountPence: P(2800) });
  const frozen = (await job(cookie, { op: 'freeze', id: j.id })).json();
  assert.deepEqual(frozen.job.frozen.rows.map((r) => [r.key, r.personId, r.amountPence]), [['scott', scott, P(500)], ['tom', tom, P(500)]]);
  assert.deepEqual(frozen.job.frozen.company, { costsPence: P(1800), reservePence: 0, retainedPence: 0 });
  const t = (await get(cookie, '?books=ac')).json().totals;
  assert.equal(t.people.find((p) => p.key === `p${scott}`).owedPence, P(500));
  assert.equal(t.people.find((p) => p.key === `p${tom}`).owedPence, P(500));
  assert.equal(t.explainedPence, t.bank.netPence, 'nothing in the bank yet, and the identity still holds');
});
