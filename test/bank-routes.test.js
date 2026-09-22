/**
 * /api/admin/bank against a real Postgres, the same way integration.test.js
 * runs the other admin routes: lib/db.js swapped for pg, everything else the
 * shipping code. A statement is imported, matched to a job, split between
 * people, taught to the importer, unmatched and removed, and the reconciliation
 * is checked to balance at every step.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { businessCsv } from './fixtures/revolut-csv.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://dampscan@127.0.0.1:55432/dampscan';

process.env.SESSION_SECRET = 'integration-test-secret-long-enough-x';
process.env.IP_SALT = 'integration-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });

mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used in tests'); },
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    queryOne: async (text, params = []) => {
      const { rows } = await pool.query(text, params);
      return rows.length ? rows[0] : null;
    },
    ping: async () => true
  }
});

const login = (await import('../lib/routes/auth/login.js')).default;
const bank = (await import('../lib/routes/admin/bank.js')).default;
const jobsRoute = (await import('../lib/routes/admin/jobs.js')).default;

function makeReq({ method = 'POST', url = '/', body, headers = {}, ip = '203.0.113.5' } = {}) {
  return { method, url, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': ip, ...headers }, body, socket: { remoteAddress: ip } };
}

function makeRes() {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(payload) { this.body = payload; }
  };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}

async function call(handler, reqInit) {
  const res = makeRes();
  await handler(makeReq(reqInit), res);
  return res;
}

let cookie;
before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const res = await call(login, { body: { code: '1290' } });
  const raw = res.getHeader('set-cookie');
  cookie = (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
});

beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, bank_statements, bank_transactions, bank_rules restart identity cascade');
});

after(async () => { await pool.end(); });

const get = (qs = '') => call(bank, { method: 'GET', url: `/api/admin/bank${qs}`, headers: { cookie } });
const post = (body, qs = '') => call(bank, { method: 'POST', url: `/api/admin/bank${qs}`, headers: { cookie }, body });
const del = (body) => call(bank, { method: 'DELETE', url: '/api/admin/bank', headers: { cookie }, body });
const upload = (csv, name = 'statement.csv') =>
  call(bank, { method: 'POST', url: `/api/admin/bank?op=import&name=${name}`, headers: { cookie, 'content-type': 'text/csv' }, body: csv });

async function createJob(over = {}) {
  const res = await call(jobsRoute, {
    method: 'POST', url: '/api/admin/jobs', headers: { cookie },
    body: { surveyType: 'localised', surveyor: 'tom', customerName: 'Priya Sharma', customerPostcode: 'ME14 1AA', jobDate: '2026-08-20', ...over }
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().job;
}

const jobRow = async (id) => (await pool.query('select * from jobs where id = $1', [id])).rows[0];

/* The month's statement: a deposit and a balance from Priya, two fuel stops,
   the tax bill, Tom's drawings, and two lines the importer should skip. */
const AUGUST = [
  { date: '2026-08-12', id: 'in-1', type: 'TRANSFER', description: 'Payment from PRIYA SHARMA', reference: 'Survey deposit', payer: 'PRIYA SHARMA', amount: 107.5 },
  { date: '2026-08-21', id: 'in-2', type: 'TRANSFER', description: 'Payment from P SHARMA', payer: 'P SHARMA', amount: 107.5 },
  { date: '2026-08-15', id: 'out-1', description: 'BP MAIDSTONE 1234', amount: -62.1, mcc: '5541' },
  { date: '2026-08-16', id: 'out-2', description: 'BP MAIDSTONE 5678', amount: -40, mcc: '5541' },
  { date: '2026-08-30', id: 'out-3', type: 'TRANSFER', description: 'To HMRC', reference: 'Self assessment', amount: -2000 },
  { date: '2026-08-31', id: 'out-4', type: 'TRANSFER', description: 'To Tom Smith', reference: 'Drawings', amount: -500 },
  { date: '2026-08-31', id: 'pend', state: 'PENDING', description: 'Pending', amount: -5 },
  { date: '2026-08-31', id: 'eur', description: 'Euro', amount: -5, currency: 'EUR' }
];

/** Every figure the page shows has to add up to the bank's own net movement. */
function assertBalances(totals) {
  assert.equal(totals.explainedPence, totals.bank.netPence, JSON.stringify(totals));
}

test('the bank route is 401 without a session', async () => {
  assert.equal((await call(bank, { method: 'GET', url: '/api/admin/bank' })).statusCode, 401);
  assert.equal((await call(bank, { method: 'POST', url: '/api/admin/bank?op=import', body: 'x' })).statusCode, 401);
});

test('importing a statement stores its lines, matches the payments and guesses the rest', async () => {
  const job = await createJob();
  const res = await upload(businessCsv(AUGUST));
  assert.equal(res.statusCode, 200, res.body);
  const r = res.json();
  assert.equal(r.added, 6);
  assert.equal(r.duplicates, 0);
  assert.deepEqual(r.skipped, { pending: 1, notGbp: 1, unreadable: 0 });
  assert.equal(r.matched, 2, 'the deposit and the balance both found the job');

  const after = await jobRow(job.id);
  assert.ok(after.deposit_paid_at, 'the bank ticked the deposit');
  assert.ok(after.paid_at, 'and paid in full once the balance arrived');
  assert.equal(after.status, 'completed', 'paid in full after the survey date is a finished job');

  const { transactions, totals } = (await get('?view=all')).json();
  assert.equal(transactions.length, 6);
  const by = Object.fromEntries(transactions.map((t) => [t.description, t]));
  assert.equal(by['BP MAIDSTONE 1234'].category, 'fuel');
  assert.deepEqual(by['BP MAIDSTONE 1234'].split, [], 'fuel waits to be split by hand');
  assert.deepEqual(by['To HMRC'].split, ['tax']);
  assert.equal(by['To HMRC'].shares.tax, -200000);
  assert.deepEqual(by['To Tom Smith'].split, ['tom']);
  assert.equal(by['Payment from PRIYA SHARMA'].jobId, job.id);
  assert.equal(by['Payment from PRIYA SHARMA'].matchKind, 'auto');

  assert.equal(totals.waiting, 2, 'the two fuel lines');
  assert.equal(totals.unsplitOutPence, -10210);
  // Localised by Tom: scott 2580, tom 12310, ben 2310, tax 4300.
  assert.deepEqual(totals.balances, { scott: 2580, tom: 12310 - 50000, ben: 2310, tax: 4300 - 200000 });
  assert.equal(totals.jobs.paid, 1);
  assert.equal(totals.differencePence, 0, '215 arrived for a 215 job');
  assertBalances(totals);
});

test('uploading an overlapping statement adds nothing twice', async () => {
  await createJob();
  await upload(businessCsv(AUGUST));
  const again = (await upload(businessCsv(AUGUST.slice(0, 4)), 'again.csv')).json();
  assert.equal(again.added, 0);
  assert.equal(again.duplicates, 4);
  assert.equal((await pool.query('select count(*)::int as n from bank_transactions')).rows[0].n, 6);
  assert.equal(again.statements.length, 2, 'the upload is still recorded');
});

test('a split chosen by hand teaches the importer and is applied to untouched twins', async () => {
  await createJob();
  await upload(businessCsv(AUGUST));
  const fuel = (await get('?view=out')).json().transactions.filter((t) => t.category === 'fuel');
  const res = await post({ id: fuel[0].id, split: ['tom', 'ben'] });
  assert.equal(res.statusCode, 200, res.body);
  const r = res.json();
  assert.equal(r.similar, 1, 'the other BP line came along');
  assert.equal(r.transactions.length, 2);
  const mine = r.transactions.find((t) => t.id === fuel[0].id);
  assert.equal(mine.splitKind, 'manual');
  const twin = r.transactions.find((t) => t.id !== fuel[0].id);
  assert.equal(twin.splitKind, 'auto', 'a rule is a guess, so a later rule may replace it');
  assert.deepEqual(twin.split, ['tom', 'ben']);
  assert.equal(twin.shares.tom + twin.shares.ben, twin.amountPence);
  assert.equal(r.totals.waiting, 0);
  assertBalances(r.totals);

  const rules = (await pool.query('select * from bank_rules')).rows;
  assert.equal(rules.length, 1);
  assert.equal(rules[0].key, 'bp maidstone');

  // Next month's fuel stop at the same garage needs no clicking.
  const next = (await upload(businessCsv([{ date: '2026-09-03', id: 'out-9', description: 'BP MAIDSTONE 9999', amount: -30 }]), 'sep.csv')).json();
  assert.equal(next.added, 1);
  const sep = (await get('?view=out')).json().transactions.find((t) => t.description === 'BP MAIDSTONE 9999');
  assert.equal(sep.category, 'fuel');
  assert.deepEqual(sep.split, ['tom', 'ben']);
  assert.deepEqual(sep.shares, { scott: 0, tom: -1500, ben: -1500, tax: 0 });
});

test('a choice made by hand on one line is never overwritten by a rule from another', async () => {
  await upload(businessCsv(AUGUST));
  const fuel = (await get('?view=out')).json().transactions.filter((t) => t.category === 'fuel');
  await post({ id: fuel[0].id, split: ['scott'] });
  await post({ id: fuel[1].id, split: ['ben'] });
  const { transactions } = (await get('?view=out')).json();
  assert.deepEqual(transactions.find((t) => t.id === fuel[0].id).split, ['scott'], 'still Scott');
  assert.deepEqual(transactions.find((t) => t.id === fuel[1].id).split, ['ben']);
});

test('unmatching a payment unticks what it paid for, and matching it again ticks it back', async () => {
  const job = await createJob();
  await upload(businessCsv(AUGUST));
  const balance = (await get('?view=in')).json().transactions.find((t) => t.description === 'Payment from P SHARMA');

  const off = (await post({ id: balance.id, jobId: null })).json();
  assert.equal(off.transactions[0].jobId, null);
  let row = await jobRow(job.id);
  assert.equal(row.paid_at, null, 'only half is matched now');
  assert.ok(row.deposit_paid_at, 'the deposit still is');
  assert.equal(off.totals.jobs.paid, 0);
  assert.equal(off.totals.partPaidPence, 10750);
  assert.equal(off.totals.unmatchedInPence, 10750);
  assertBalances(off.totals);

  const on = (await post({ id: balance.id, jobId: job.id })).json();
  assert.equal(on.transactions[0].matchKind, 'manual');
  row = await jobRow(job.id);
  assert.ok(row.paid_at);
  assert.equal(on.totals.differencePence, 0);
  assertBalances(on.totals);
});

test('matching a line to a job clears any split, so money is never counted twice', async () => {
  const job = await createJob();
  await upload(businessCsv([{ date: '2026-08-12', id: 'in-x', type: 'TRANSFER', description: 'Payment from SOMEONE', amount: 215 }]));
  const line = (await get('?view=in')).json().transactions[0];
  assert.equal(line.jobId, null, 'amount alone is not a match');
  assert.deepEqual(line.suggested, [job.id], 'but it is suggested');

  await post({ id: line.id, split: ['scott'] });
  const matched = (await post({ id: line.id, jobId: job.id })).json().transactions[0];
  assert.deepEqual(matched.split, []);
  assert.deepEqual(matched.shares, { scott: 0, tom: 0, ben: 0, tax: 0 });
  assert.equal(matched.category, 'income');
});

test('money out cannot be matched to a job, and nonsense is refused with field errors', async () => {
  const job = await createJob();
  await upload(businessCsv(AUGUST));
  const fuel = (await get('?view=out')).json().transactions[0];
  const res = await post({ id: fuel.id, jobId: job.id });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().errors.jobId);

  assert.ok((await post({ id: fuel.id, split: ['dave'] })).json().errors.split);
  assert.ok((await post({ id: fuel.id, category: 'yachts' })).json().errors.category);
  assert.equal((await post({ id: 999999, category: 'fuel' })).statusCode, 404);
});

test('a transfer between own accounts is left out of every figure', async () => {
  await upload(businessCsv([
    { date: '2026-08-12', id: 'v-1', type: 'TRANSFER', description: 'To Savings Vault', amount: -1000 },
    { date: '2026-08-13', id: 'c-1', description: 'Screwfix', amount: -20 }
  ]));
  const { transactions, totals } = (await get('?view=all')).json();
  assert.equal(transactions.find((t) => t.description === 'To Savings Vault').category, 'transfer');
  assert.equal(totals.bank.outPence, 2000);
  assert.equal(totals.waiting, 1);
  assert.equal((await get('?view=attention')).json().transactions.length, 1);
  assertBalances(totals);
});

test('removing an upload takes its lines and their paid ticks with it', async () => {
  const job = await createJob();
  const first = (await upload(businessCsv(AUGUST))).json();
  assert.ok((await jobRow(job.id)).paid_at);

  const res = await del({ statementId: first.statementId });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((await pool.query('select count(*)::int as n from bank_transactions')).rows[0].n, 0);
  const row = await jobRow(job.id);
  assert.equal(row.paid_at, null);
  assert.equal(row.deposit_paid_at, null);
  assert.equal(res.json().statements.length, 0);
  assert.equal((await del({ statementId: 424242 })).statusCode, 404);
});

test('the difference names the jobs behind it, and they add back to it', async () => {
  const job = await createJob();
  await upload(businessCsv(AUGUST));
  const clean = (await get()).json().totals;
  assert.equal(clean.differencePence, 0);
  assert.deepEqual(clean.differenceJobs, [], 'nothing to chase when the books are square');

  // A third payment matched to a job that was already square: 215 recorded,
  // 265 in the bank.
  await upload(businessCsv([
    { date: '2026-08-25', id: 'in-3', type: 'TRANSFER', description: 'Payment from PRIYA AGAIN', amount: 50 }
  ]), 'extra.csv');
  const extra = (await get('?view=in')).json().transactions.find((t) => t.description === 'Payment from PRIYA AGAIN');
  const t = (await post({ id: extra.id, jobId: job.id })).json().totals;

  assert.equal(t.differencePence, 5000);
  assert.equal(t.differenceJobs.length, 1);
  const [only] = t.differenceJobs;
  assert.equal(only.id, job.id);
  assert.equal(only.receivedPence, 26500);
  assert.equal(only.countedValuePence, 21500);
  assert.equal(only.deltaPence, 5000);
  assert.equal(only.lines, 3);
  assert.equal(only.reason, 'more money matched than the job is worth');
  assert.equal(t.differenceJobs.reduce((sum, j) => sum + j.deltaPence, 0), t.differencePence,
    'the list is the whole of the difference');
  assertBalances(t);

  // A job paid before the window is the other everyday cause: its money is out
  // of scope but the price would otherwise be counted in full.
  const later = (await get('?from=2026-08-30')).json().totals;
  assert.equal(later.differencePence, 0, 'out of scope on both sides');
  assert.deepEqual(later.differenceJobs, []);
});

test('the reconciliation can start later than the first line', async () => {
  await createJob();
  await upload(businessCsv(AUGUST));
  const all = (await get()).json().totals;
  assert.equal(all.from, '2026-08-12', 'defaults to the first line');
  const later = (await get('?from=2026-08-30')).json().totals;
  assert.equal(later.from, '2026-08-30');
  assert.equal(later.bank.inPence, 0);
  assert.equal(later.bank.outPence, 250000);
  assert.equal(later.jobs.paid, 0, 'a job paid before the start is out of scope');
  assertBalances(later);
});

test('something that is not a statement is refused, and an empty body too', async () => {
  const bad = await upload('name,email\nPriya,p@x.com\n');
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'not_a_statement');
  assert.equal((await upload('   ')).statusCode, 400);
  assert.equal((await pool.query('select count(*)::int as n from bank_statements')).rows[0].n, 0, 'nothing recorded for a refused file');
});
