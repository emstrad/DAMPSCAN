/**
 * The orphan sweep and the cron route in front of it.
 *
 * Blob and the database are both mocked, because this is a test of the rule
 * for what may be deleted, and that rule has to be exactly right: the failure
 * mode of a sweep is deleting a customer's survey.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'sweep-test-secret-long-enough-xxxxx';
process.env.IP_SALT = 'sweep-test-salt';

const DAY = 24 * 60 * 60 * 1000;
const old = new Date(Date.now() - 3 * DAY);
const fresh = new Date(Date.now() - 60 * 1000);

let store = [];          // { pathname, uploadedAt }
let referenced = [];     // paths the fake leads table names
let dbThrows = false;
let deleted = [];

mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async () => { if (dbThrows) throw new Error('connection refused'); return referenced.map((path) => ({ path })); },
    queryOne: async () => null,
    ping: async () => true
  }
});

mock.module('@vercel/blob', {
  namedExports: {
    list: async ({ prefix, cursor, limit }) => {
      const under = store.filter((b) => b.pathname.startsWith(prefix));
      // Two pages, to prove the cursor is followed.
      const start = cursor ? Number(cursor) : 0;
      const page = under.slice(start, start + 2);
      const next = start + 2;
      return { blobs: page, hasMore: next < under.length, cursor: next < under.length ? String(next) : undefined };
    },
    del: async (paths) => { deleted.push(...(Array.isArray(paths) ? paths : [paths])); },
    put: async () => { throw new Error('not used'); },
    get: async () => null,
    issueSignedToken: async () => { throw new Error('not used'); },
    presignUrl: async () => { throw new Error('not used'); }
  }
});

const { sweepOrphans } = await import('../lib/sweep.js');
const cron = (await import('../api/cron/sweep-blobs.js')).default;

beforeEach(() => {
  store = [];
  referenced = [];
  dbThrows = false;
  deleted = [];
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  process.env.CRON_SECRET = 'a-cron-secret-that-is-long-enough';
});

test('an old blob no lead names is removed; a referenced one and a young one are kept', async () => {
  store = [
    { pathname: 'leads/2026-09-01/a-kept.pdf', uploadedAt: old },
    { pathname: 'leads/2026-09-01/b-orphan.jpg', uploadedAt: old },
    { pathname: 'leads/2026-09-04/c-in-flight.jpg', uploadedAt: fresh }
  ];
  referenced = ['leads/2026-09-01/a-kept.pdf'];
  const out = await sweepOrphans();
  assert.equal(out.ok, true);
  assert.equal(out.scanned, 3);
  assert.equal(out.referenced, 1);
  assert.deepEqual(deleted, ['leads/2026-09-01/b-orphan.jpg']);
  assert.equal(out.removed, 1);
});

test('pagination is followed to the end', async () => {
  store = Array.from({ length: 5 }, (_, i) => ({ pathname: `leads/2026-09-01/${i}.jpg`, uploadedAt: old }));
  referenced = ['leads/2026-09-01/0.jpg'];
  const out = await sweepOrphans({ force: false });
  assert.equal(out.scanned, 5, 'every page was read, not just the first');
  assert.equal(deleted.length, 4);
});

test('a dry run reports what would go and deletes nothing', async () => {
  store = [{ pathname: 'leads/2026-09-01/orphan.jpg', uploadedAt: old }];
  referenced = ['leads/2026-09-01/something-else.pdf'];
  const out = await sweepOrphans({ dryRun: true });
  assert.equal(out.ok, true);
  assert.equal(out.orphans, 1);
  assert.equal(out.removed, 0);
  assert.deepEqual(deleted, []);
});

test('a database that fails aborts the sweep before anything is listed as an orphan', async () => {
  // The one outcome this must never produce: every blob treated as unreferenced
  // because the query threw.
  store = [{ pathname: 'leads/2026-09-01/customer.pdf', uploadedAt: old }];
  dbThrows = true;
  const out = await sweepOrphans();
  assert.equal(out.ok, false);
  assert.match(out.reason, /^db_failed/);
  assert.deepEqual(deleted, []);
});

test('a database naming no attachments at all is refused without force', async () => {
  // More likely a wrong DATABASE_URL than a store full of abandonments.
  store = [{ pathname: 'leads/2026-09-01/customer.pdf', uploadedAt: old }];
  referenced = [];
  const out = await sweepOrphans();
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'nothing_referenced');
  assert.deepEqual(deleted, []);

  const forced = await sweepOrphans({ force: true });
  assert.equal(forced.ok, true);
  assert.deepEqual(deleted, ['leads/2026-09-01/customer.pdf']);
});

test('an empty store with no references is simply nothing to do', async () => {
  const out = await sweepOrphans();
  assert.equal(out.ok, true);
  assert.equal(out.scanned, 0);
});

test('no blob store configured is reported, not treated as empty', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const out = await sweepOrphans();
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'not_configured');
});

/* -------------------------------------------------------------- cron ---- */
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(payload) { this.body = payload; } };
  res.json = () => JSON.parse(res.body);
  return res;
}
async function hit(headers = {}) {
  const res = makeRes();
  await cron({ method: 'GET', url: '/api/cron/sweep-blobs', headers: { host: 'dampscan.co.uk', ...headers } }, res);
  return res;
}

test('the cron route runs the sweep for the bearer Vercel sends', async () => {
  store = [{ pathname: 'leads/2026-09-01/orphan.jpg', uploadedAt: old }];
  referenced = ['leads/2026-09-01/kept.pdf'];
  const res = await hit({ authorization: 'Bearer a-cron-secret-that-is-long-enough' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().removed, 1);
});

test('the cron route refuses a wrong or missing bearer', async () => {
  assert.equal((await hit({ authorization: 'Bearer nope' })).statusCode, 401);
  assert.equal((await hit()).statusCode, 401);
  assert.deepEqual(deleted, []);
});

test('with no CRON_SECRET the route refuses everyone, Vercel included', async () => {
  // A deletion job must not be reachable on an open URL because a variable
  // was never set.
  delete process.env.CRON_SECRET;
  const res = await hit({ authorization: 'Bearer anything' });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(deleted, []);
});
