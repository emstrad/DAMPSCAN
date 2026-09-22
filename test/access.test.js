/**
 * Who may see what.
 *
 * The shared code is the legacy damp login and must keep working exactly as it
 * did. A person signs in with their own passcode and sees only the businesses
 * they are granted, and that is enforced in the query, not by hiding a tab:
 * every assertion here goes through the real routes with a real cookie.
 *
 * Steve is the case that matters. Roofing only, and not an admin.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://dampscan@127.0.0.1:55432/dampscan';

process.env.SESSION_SECRET = 'access-test-secret-long-enough-xxxx';
process.env.IP_SALT = 'access-test-salt';
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
const leadsRoute = (await import('../lib/routes/admin/leads.js')).default;
const clientsRoute = (await import('../lib/routes/admin/clients.js')).default;
const jobsRoute = (await import('../lib/routes/admin/jobs.js')).default;
const summary = (await import('../lib/routes/admin/summary.js')).default;
const bank = (await import('../lib/routes/admin/bank.js')).default;
const me = (await import('../lib/routes/admin/me.js')).default;

function makeReq({ method = 'POST', url = '/', body, headers = {}, ip = '203.0.113.9' } = {}) {
  return {
    method, url, body,
    headers: { host: 'dampscan.co.uk', 'x-forwarded-for': ip, 'user-agent': 'test', ...headers },
    socket: { remoteAddress: ip }
  };
}
function makeRes() {
  const res = {
    statusCode: 200, headers: {}, body: undefined, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(payload) { this.writableEnded = true; this.body = payload; }
  };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) {
  const req = makeReq(init); const res = makeRes();
  await handler(req, res);
  return res;
}
const cookieOf = (res) => {
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
};

async function person(name, passcode, grants, isAdmin = false) {
  const passcodeHash = await hash(passcode, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query(
    'insert into people (name, passcode_hash, is_admin) values ($1, $2, $3) returning id',
    [name, passcodeHash, isAdmin]
  );
  for (const slug of grants) {
    await pool.query('insert into grants (person_id, business_slug, level) values ($1, $2, $3)', [rows[0].id, slug, 'work']);
  }
  return Number(rows[0].id);
}

async function signIn(code) {
  const res = await call(login, { body: { code } });
  assert.equal(res.statusCode, 200, `sign in with ${code}: ${res.body}`);
  return cookieOf(res);
}

/* A lead and a job in each of three businesses, so a filter has something to
   hide. Jobs are recorded by hand; the surveyor constraint is still damp's. */
async function seed() {
  for (const [site, sid] of [['dampscan', 'a1111111-1111-4111-8111-111111111111'], ['ati-london', 'a2222222-2222-4222-8222-222222222222'], ['roofing', 'a3333333-3333-4333-8333-333333333333']]) {
    await pool.query(
      `insert into leads (stage, first_name, email, postcode, session_id, site) values ('complete', $1, $2, 'SE1 2AB', $3, $4)`,
      [site, `${site}@example.com`, sid, site]
    );
    await pool.query(
      `insert into jobs (site, customer_name, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, status)
       values ($1, $2, 'ben', 2000, 1500, 'scott', 'tom', 'ben', 'booked')`,
      [site, `${site} customer`]
    );
  }
}

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit restart identity cascade');
  await seed();
});
after(async () => { await pool.end(); });

test('the shared code still signs in, as the owners\' admin over every active business', async () => {
  const cookie = await signIn('1290');
  const who = (await call(me, { method: 'GET', url: '/api/admin/me', headers: { cookie } })).json();
  assert.equal(who.legacy, true);
  assert.equal(who.isAdmin, true);
  assert.deepEqual(who.businesses.map((b) => b.slug), ['ac', 'ati-london', 'dampscan', 'roofing']);

  const leads = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=all', headers: { cookie } })).json();
  assert.deepEqual(leads.leads.map((l) => l.site).sort(), ['ati-london', 'dampscan', 'roofing']);
});

test('Steve, roofing only, sees roofing and nothing else on every list route', async () => {
  await person('Steve', 'steve-passcode', ['roofing']);
  const cookie = await signIn('steve-passcode');

  const who = (await call(me, { method: 'GET', url: '/api/admin/me', headers: { cookie } })).json();
  assert.equal(who.name, 'Steve');
  assert.equal(who.isAdmin, false);
  assert.deepEqual(who.businesses.map((b) => b.slug), ['roofing']);

  const leads = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=all', headers: { cookie } })).json();
  assert.deepEqual(leads.leads.map((l) => l.site), ['roofing']);

  /* Asking for a business outside the scope by URL yields nothing, not an
     error, and never the rows. */
  const sneaky = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=all&site=dampscan', headers: { cookie } })).json();
  assert.equal(sneaky.leads.length, 0);
  assert.equal(sneaky.total, 0);

  const cards = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=all', headers: { cookie } })).json();
  assert.deepEqual(cards.clients.map((c) => c.site), ['roofing']);

  const jobs = (await call(jobsRoute, { method: 'GET', url: '/api/admin/jobs?range=all', headers: { cookie } })).json();
  assert.deepEqual(jobs.jobs.map((j) => j.site), ['roofing']);

  const sum = (await call(summary, { method: 'GET', url: '/api/admin/summary?range=all', headers: { cookie } })).json();
  assert.equal(sum.ok, true);
  assert.deepEqual(sum.viewer.businesses, ['roofing']);
});

test('a worker cannot open the bank, and an admin can', async () => {
  await person('Steve', 'steve-passcode', ['roofing']);
  await person('Scott', 'scott-passcode', ['dampscan', 'ati-london', 'roofing', 'ac'], true);
  const steve = await signIn('steve-passcode');
  const scott = await signIn('scott-passcode');
  assert.equal((await call(bank, { method: 'GET', url: '/api/admin/bank', headers: { cookie: steve } })).statusCode, 403);
  assert.equal((await call(bank, { method: 'GET', url: '/api/admin/bank', headers: { cookie: scott } })).statusCode, 200);
});

test('a card outside the scope is a 404 to update, not a hint that it exists', async () => {
  await person('Steve', 'steve-passcode', ['roofing']);
  const cookie = await signIn('steve-passcode');
  const { rows } = await pool.query(`select id from jobs where site = 'dampscan'`);
  const res = await call(clientsRoute, { body: { id: rows[0].id, note: 'not mine' }, headers: { cookie } });
  assert.equal(res.statusCode, 404);
  const still = await pool.query('select note from jobs where id = $1', [rows[0].id]);
  assert.equal(still.rows[0].note, null, 'and nothing was written');
});

test('deactivating a person takes effect on their next request, not at their next login', async () => {
  const id = await person('Ben', 'ben-passcode', ['dampscan', 'roofing']);
  const cookie = await signIn('ben-passcode');
  assert.equal((await call(me, { method: 'GET', url: '/api/admin/me', headers: { cookie } })).statusCode, 200);
  await pool.query('update people set active = false where id = $1', [id]);
  assert.equal((await call(me, { method: 'GET', url: '/api/admin/me', headers: { cookie } })).statusCode, 403);
});

test('a person with no grants and no admin flag is refused rather than shown an empty page', async () => {
  await person('Nobody', 'nobody-passcode', []);
  const cookie = await signIn('nobody-passcode');
  assert.equal((await call(leadsRoute, { method: 'GET', url: '/api/admin/leads', headers: { cookie } })).statusCode, 403);
});

test('a wrong passcode counts against the throttle exactly as a wrong shared code does', async () => {
  await person('Steve', 'steve-passcode', ['roofing']);
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await call(login, { body: { code: 'wrong-guess' } })).statusCode, 401);
  }
  assert.equal((await call(login, { body: { code: 'steve-passcode' } })).statusCode, 429, 'locked out after five, even with the right code');
});

test('a client update by a person is written to the audit trail with before and after', async () => {
  await person('Ben', 'ben-passcode', ['dampscan', 'roofing']);
  const cookie = await signIn('ben-passcode');
  const { rows } = await pool.query(`select id from jobs where site = 'roofing'`);
  const res = await call(clientsRoute, { body: { id: rows[0].id, note: 'Scaffold Tuesday' }, headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const audit = (await pool.query('select * from audit order by id desc limit 1')).rows[0];
  assert.equal(audit.entity, 'job');
  assert.equal(Number(audit.entity_id), Number(rows[0].id));
  assert.equal(audit.business_slug, 'roofing');
  assert.equal(audit.before_json.note, null);
  assert.equal(audit.after_json.note, 'Scaffold Tuesday');
  assert.ok(audit.person_id, 'attributed to the person, not to nobody');
});
