/**
 * End-to-end tests for the /api handlers.
 *
 * lib/db.js is swapped for a plain `pg` client pointed at a local Postgres, so
 * the real handlers run the real SQL against a real database. Everything else,
 * validation, throttling, sessions, notification handling, is the shipping code.
 *
 *   npm test
 *
 * Needs a local Postgres with db/schema.sql applied. See README, "Running the
 * tests". Never point TEST_DATABASE_URL at production: each run truncates.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://dampscan@127.0.0.1:55432/dampscan';

process.env.SESSION_SECRET = 'integration-test-secret-long-enough-x';
process.env.IP_SALT = 'integration-test-salt';
process.env.FORMSUBMIT_ENDPOINT = 'https://formsubmit.example.invalid/ajax/test';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });

// Swap the Neon client for pg. Must happen before any handler is imported.
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used in tests'); },
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    queryOne: async (text, params = []) => {
      const { rows } = await pool.query(text, params);
      return rows.length ? rows[0] : null;
    },
    ping: async () => {
      try { return (await pool.query('select 1 as ok')).rows[0].ok === 1; } catch { return false; }
    }
  }
});

const lead = (await import('../api/lead.js')).default;
const event = (await import('../api/event.js')).default;
const health = (await import('../api/health.js')).default;
const login = (await import('../api/auth/login.js')).default;
const logout = (await import('../api/auth/logout.js')).default;
const summary = (await import('../api/admin/summary.js')).default;
const leadsRoute = (await import('../api/admin/leads.js')).default;
const notified = (await import('../api/notified.js')).default;
const jobsRoute = (await import('../api/admin/jobs.js')).default;
const ratesRoute = (await import('../api/admin/rates.js')).default;
const clientsRoute = (await import('../api/admin/clients.js')).default;
const { siteFor } = await import('../lib/site.js');

/* ---------- minimal req/res doubles ---------- */
function makeReq({ method = 'POST', url = '/', body, headers = {}, ip = '203.0.113.5' } = {}) {
  return {
    method,
    url,
    headers: { host: 'dampscan.co.uk', 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (iPhone) Mobile', ...headers },
    body,
    socket: { remoteAddress: ip }
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(payload) { this.writableEnded = true; this.body = payload; }
  };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}

async function call(handler, reqInit) {
  const req = makeReq(reqInit);
  const res = makeRes();
  await handler(req, res);
  return res;
}

/** Set-Cookie may be a string or an array depending on the header count. */
function cookieHeader(res) {
  const raw = res.getHeader('set-cookie');
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw.join('; ') : String(raw);
}

const SID_A = '11111111-1111-4111-8111-111111111111';
const SID_B = '22222222-2222-4222-8222-222222222222';

const validLead = (over = {}) => ({
  stage: 'complete', sessionId: SID_A, firstName: 'Priya', email: 'priya@example.com',
  postcode: 'se1 2ab', phone: '07700 900123', issues: ['Damp', 'Mould'],
  role: 'Homeowner', previousSurvey: true, notes: 'Upstairs bathroom',
  sourcePath: '/', referrer: 'https://www.google.com/', utm: { utm_source: 'google', utm_medium: 'cpc' },
  ...over
});

before(async () => {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  // FormSubmit is never really called. Every test asserts on notify_error or
  // notified_at instead, so no test depends on the network.
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '{"success":"true"}' });
});

beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, staff_users, jobs restart identity cascade');
  // job_rates and job_settings are seeded by schema.sql and are configuration,
  // not test data, so they are reset to the seeded values rather than emptied.
  // Both matter: a test that raises the Localised price must not leave it
  // raised for the next one, which is exactly what happened when only the
  // settings were reset here.
  await pool.query(`update job_settings set tax_bp = 2000, lead_bp = 1500,
    lead_earner = 'scott', partner_a = 'tom', partner_b = 'ben' where id = true`);
  await pool.query(`update job_rates set price_pence = v.price, surveyor_fee_pence = v.fee
    from (values ('localised', 21500, 10000), ('full-house', 29500, 13000),
                 ('large-property', 37500, 16000), ('premium', 45000, 19000))
         as v(key, price, fee)
    where job_rates.key = v.key`);
});

after(async () => { await pool.end(); });

/* ---------------------------------------------------------------- health ---- */
test('health reports db true and a ready schema', async () => {
  const res = await call(health, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.db, true);
  assert.equal(body.schema.ready, true);
  assert.deepEqual(body.schema.missing, []);
});

test('health names a missing table rather than just failing', async () => {
  // The exact situation behind a "Sign in is temporarily unavailable": the
  // database answers, but the table the login throttle needs is not there.
  await pool.query('alter table rate_hits rename to rate_hits_hidden');
  try {
    const body = (await call(health, { method: 'GET' })).json();
    assert.equal(body.db, true, 'the connection still works');
    assert.equal(body.schema.ready, false);
    assert.deepEqual(body.schema.missing, ['rate_hits']);
  } finally {
    await pool.query('alter table rate_hits_hidden rename to rate_hits');
  }
});

test('health rejects POST with 405', async () => {
  const res = await call(health, { method: 'POST' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('allow'), 'GET');
});

/* ------------------------------------------------------------------ site ---- */
test('the site is derived from the Host header, never trusted from the body', () => {
  const at = (host) => siteFor({ headers: { host } });
  assert.equal(at('dampscan.co.uk'), 'dampscan');
  assert.equal(at('www.dampscan.co.uk'), 'dampscan');
  assert.equal(at('atidampsurvey.co.uk'), 'ati-london');
  assert.equal(at('www.atidampsurvey.co.uk'), 'ati-london');
  assert.equal(at('ATIDAMPSURVEY.CO.UK'), 'ati-london', 'case must not matter');
  assert.equal(at('atidampsurvey.co.uk:443'), 'ati-london', 'a port must not matter');
  assert.equal(at(undefined), 'dampscan', 'a missing host falls back rather than throwing');
  assert.equal(siteFor({ headers: { 'x-forwarded-host': 'atidampsurvey.co.uk', host: 'x.vercel.app' } }),
    'ati-london', 'the forwarded host wins');
});

test('leads and events are tagged with the site that produced them', async () => {
  const londonHeaders = { host: 'atidampsurvey.co.uk' };
  await call(event, { body: { sessionId: SID_B, type: 'page_view' }, headers: londonHeaders });
  const { id } = (await call(lead, { body: validLead({ sessionId: SID_B }), headers: londonHeaders })).json();
  await call(lead, { body: validLead() });   // default host is dampscan.co.uk

  const leadRows = await pool.query('select site from leads order by id');
  assert.deepEqual(leadRows.rows.map((r) => r.site), ['ati-london', 'dampscan']);
  const evRows = await pool.query('select site from events where session_id = $1', [SID_B]);
  assert.equal(evRows.rows[0].site, 'ati-london');
  assert.ok(id);
});

/* ------------------------------------------------------------------ lead ---- */
test('complete lead is written, normalised and answered with an id', async () => {
  const res = await call(lead, { body: validLead() });
  assert.equal(res.statusCode, 200);
  const out = res.json();
  assert.equal(out.ok, true);
  assert.ok(out.id);

  const { rows } = await pool.query('select * from leads where id = $1', [out.id]);
  assert.equal(rows[0].postcode, 'SE1 2AB', 'postcode is uppercased and spaced');
  assert.equal(rows[0].email, 'priya@example.com');
  assert.deepEqual(rows[0].issues, ['Damp', 'Mould']);
  assert.equal(rows[0].previous_survey, true);
  assert.equal(rows[0].stage, 'complete');
  assert.equal(rows[0].ip_hash.length, 64, 'ip is hashed, not stored raw');
  assert.ok(!String(rows[0].ip_hash).includes('203.0.113'), 'raw ip must never appear');
});

test('partial then complete on one session reconcile to two rows, one booking', async () => {
  await call(lead, { body: validLead({ stage: 'partial', issues: [], role: null, previousSurvey: null }) });
  await call(lead, { body: validLead({ stage: 'complete' }) });

  const { rows } = await pool.query(
    `select stage from leads where session_id = $1 order by stage`, [SID_A]
  );
  assert.deepEqual(rows.map((r) => r.stage), ['complete', 'partial']);
});

test('resubmitting the same stage updates rather than duplicating', async () => {
  const first = (await call(lead, { body: validLead() })).json();
  const second = (await call(lead, { body: validLead({ notes: 'Changed my mind' }) })).json();
  assert.equal(first.id, second.id, 'same row, upserted on (session_id, stage)');

  const { rows } = await pool.query('select count(*)::int as n from leads');
  assert.equal(rows[0].n, 1);
});

test('the full address is stored, which is the whole reason the form asks', async () => {
  const out = (await call(lead, { body: validLead({
    addressLine1: 'Flat 6, Trafalgar Point',
    addressLine2: '137 Downham Road',
    town: 'London'
  }) })).json();

  const { rows } = await pool.query(
    'select address_line1, address_line2, town from leads where id = $1', [out.id]
  );
  assert.equal(rows[0].address_line1, 'Flat 6, Trafalgar Point');
  assert.equal(rows[0].address_line2, '137 Downham Road');
  assert.equal(rows[0].town, 'London');
});

test('a later partial cannot blank the address the booking already gave us', async () => {
  // The order that actually happens: they book, then the held partial flushes
  // on pagehide from the same session. Without the coalesce in the upsert that
  // second write would wipe the address off the row we care about.
  await call(lead, { body: validLead({ addressLine1: '12 Bridge Street', town: 'Maidstone' }) });
  await call(lead, { body: validLead({ addressLine1: '', addressLine2: '', town: '' }) });

  const { rows } = await pool.query(
    'select address_line1, town from leads where session_id = $1 and stage = $2', [SID_A, 'complete']
  );
  assert.equal(rows[0].address_line1, '12 Bridge Street');
  assert.equal(rows[0].town, 'Maidstone');
});

test('attachments are stored as paths, and only ones we could have written', async () => {
  const mine = 'leads/2026-09-04/report-Kq7z2.pdf';
  const out = (await call(lead, { body: validLead({
    files: [mine, 'other/2026-09-04/someone-elses.pdf', '../../etc/passwd']
  }) })).json();

  const { rows } = await pool.query('select files from leads where id = $1', [out.id]);
  assert.deepEqual(rows[0].files, [mine], 'a path outside the leads prefix never reaches the column');
});

test('a lead with no attachments gets an empty array, never null', async () => {
  const out = (await call(lead, { body: validLead() })).json();
  const { rows } = await pool.query('select files from leads where id = $1', [out.id]);
  assert.deepEqual(rows[0].files, []);
});

test('honeypot returns 200 and writes nothing at all', async () => {
  const res = await call(lead, { body: validLead({ honeypot: 'i-am-a-bot' }) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true }, 'silent success, so bots learn nothing');

  const { rows } = await pool.query('select count(*)::int as n from leads');
  assert.equal(rows[0].n, 0);
});

test('invalid fields return 400 with a field-keyed error object', async () => {
  const res = await call(lead, {
    body: validLead({ email: 'not-an-email', postcode: 'ZZZ', firstName: '', issues: ['Haunted'], role: 'Wizard' })
  });
  assert.equal(res.statusCode, 400);
  const errors = res.json().errors;
  assert.ok(errors.email && errors.postcode && errors.firstName && errors.issues && errors.role);
  // Messages match the static copy already in index.html.
  assert.equal(errors.email, 'Please enter a valid email address.');
  assert.equal(errors.firstName, 'Please enter your first name.');

  const { rows } = await pool.query('select count(*)::int as n from leads');
  assert.equal(rows[0].n, 0, 'nothing is written on a validation failure');
});

test('rate limit: 8 leads allowed, the 9th is refused', async () => {
  const statuses = [];
  for (let i = 0; i < 10; i += 1) {
    const res = await call(lead, {
      body: validLead({ sessionId: `3333333${i}-3333-4333-8333-333333333333` }),
      ip: '198.51.100.7'
    });
    statuses.push(res.statusCode);
  }
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(200));
  assert.equal(statuses[8], 429);
  assert.equal(statuses[9], 429);
});

test('rate limit is per address, so one visitor cannot lock out another', async () => {
  for (let i = 0; i < 9; i += 1) {
    await call(lead, { body: validLead({ sessionId: `4444444${i}-4444-4444-8444-444444444444` }), ip: '198.51.100.8' });
  }
  const other = await call(lead, { body: validLead({ sessionId: SID_B }), ip: '198.51.100.9' });
  assert.equal(other.statusCode, 200);
});




test('a booking back-fills lead_id onto that session\'s earlier events', async () => {
  await call(event, { body: { sessionId: SID_A, type: 'page_view' } });
  await call(event, { body: { sessionId: SID_A, type: 'call_click', detail: { placement: 'header' } } });
  const { id } = (await call(lead, { body: validLead() })).json();

  const { rows } = await pool.query('select count(*)::int as n from events where lead_id = $1', [id]);
  assert.equal(rows[0].n, 2, 'the channel that produced the booking is now attributable');
});

test('lead rejects GET and cross-origin POST', async () => {
  assert.equal((await call(lead, { method: 'GET' })).statusCode, 405);
  const cross = await call(lead, { body: validLead(), headers: { origin: 'https://evil.example' } });
  assert.equal(cross.statusCode, 403);
});

/* ----------------------------------------------------------------- event ---- */
test('event is stored with server-derived channel and device', async () => {
  const res = await call(event, {
    body: {
      sessionId: SID_A, type: 'call_click', detail: { placement: 'header', secret: 'dropme' },
      path: '/', referrer: 'https://www.google.com/', utm: { utm_medium: 'cpc', utm_campaign: 'damp-london' },
      landingPage: '/?utm_medium=cpc'
    }
  });
  assert.equal(res.statusCode, 204);

  const { rows } = await pool.query('select * from events where session_id = $1', [SID_A]);
  assert.equal(rows[0].channel, 'paid', 'derived from utm_medium, not trusted from the client');
  assert.equal(rows[0].device, 'mobile', 'derived from the user agent');
  assert.deepEqual(rows[0].detail, { placement: 'header' }, 'unknown detail keys are stripped');
});

test('event rejects a type outside the allow-list', async () => {
  const res = await call(event, { body: { sessionId: SID_A, type: 'exfiltrate' } });
  assert.equal(res.statusCode, 400);
  const { rows } = await pool.query('select count(*)::int as n from events');
  assert.equal(rows[0].n, 0);
});

test('event rejects a malformed session id', async () => {
  assert.equal((await call(event, { body: { sessionId: 'nope', type: 'page_view' } })).statusCode, 400);
});

test('event rate limit allows 60 then refuses', async () => {
  for (let i = 0; i < 60; i += 1) {
    const res = await call(event, { body: { sessionId: SID_A, type: 'page_view' }, ip: '198.51.100.20' });
    assert.equal(res.statusCode, 204, `request ${i + 1} should pass`);
  }
  const over = await call(event, { body: { sessionId: SID_A, type: 'page_view' }, ip: '198.51.100.20' });
  assert.equal(over.statusCode, 429);
});

/* ------------------------------------------------------------------ auth ---- */
test('the correct access code signs in and sets a hardened cookie', async () => {
  const res = await call(login, { body: { code: '1290' } });
  assert.equal(res.statusCode, 200);

  const cookie = cookieHeader(res);
  assert.match(cookie, /^ds_staff=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=28800/, '8 hour expiry');

  const events = await pool.query(`select count(*)::int as n from events where type = 'staff_login'`);
  assert.equal(events.rows[0].n, 1);
});

test('a wrong code is refused with a generic error and no cookie', async () => {
  const res = await call(login, { body: { code: '9999' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'That code was not recognised.');
  assert.equal(cookieHeader(res), undefined);
  const failed = await pool.query(`select count(*)::int as n from events where type = 'staff_login_failed'`);
  assert.equal(failed.rows[0].n, 1);
});

test('a missing or empty code is refused', async () => {
  assert.equal((await call(login, { body: {} })).statusCode, 401);
  assert.equal((await call(login, { body: { code: '' } })).statusCode, 401);
  assert.equal((await call(login, { body: { code: '   ' } })).statusCode, 401);
});

test('a near-miss code is refused', async () => {
  for (const code of ['129', '12900', '1291', ' 1290x', 'abcd']) {
    const res = await call(login, { body: { code } });
    assert.equal(res.statusCode, 401, `"${code}" must not sign in`);
  }
});

test('an unconfigured code refuses everything, including an empty submission', async () => {
  // Regression: hashing both sides means an unset variable would otherwise let
  // an empty submission compare equal to an empty expected value.
  const saved = process.env.STAFF_ACCESS_CODE;
  try {
    delete process.env.STAFF_ACCESS_CODE;
    assert.equal((await call(login, { body: { code: '' } })).statusCode, 503);
    assert.equal((await call(login, { body: {} })).statusCode, 503);
    process.env.STAFF_ACCESS_CODE = '123';   // under the 4 character floor
    assert.equal((await call(login, { body: { code: '123' } })).statusCode, 503);
  } finally {
    process.env.STAFF_ACCESS_CODE = saved;
  }
});

test('6 wrong codes in a row from one address produce a 429', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await call(login, { body: { code: '9999' }, ip: '198.51.100.30' });
    statuses.push(res.statusCode);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);

  // The correct code is refused too while the throttle is active.
  const blocked = await call(login, { body: { code: '1290' }, ip: '198.51.100.30' });
  assert.equal(blocked.statusCode, 429);
});

test('a global ceiling stops a rotating pool of addresses walking the keyspace', async () => {
  // 4 failures each from 13 different addresses stays under the per-IP limit of
  // 5 every time, but crosses the global ceiling of 50.
  let sawGlobalBlock = false;
  for (let host = 0; host < 13 && !sawGlobalBlock; host += 1) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await call(login, { body: { code: '9999' }, ip: `198.51.101.${host}` });
      if (res.statusCode === 429) { sawGlobalBlock = true; break; }
    }
  }
  assert.ok(sawGlobalBlock, 'distributed guessing must eventually be refused');

  // A fresh address is blocked as well, which is the point of a global counter.
  const fresh = await call(login, { body: { code: '1290' }, ip: '203.0.113.99' });
  assert.equal(fresh.statusCode, 429);
});

test('a successful sign in clears earlier failures', async () => {
  for (let i = 0; i < 3; i += 1) {
    await call(login, { body: { code: '9999' }, ip: '198.51.100.31' });
  }
  const ok = await call(login, { body: { code: '1290' }, ip: '198.51.100.31' });
  assert.equal(ok.statusCode, 200);
  const { rows } = await pool.query(`select count(*)::int as n from rate_hits where bucket like 'login%'`);
  assert.equal(rows[0].n, 0);
});

test('logout clears the cookie', async () => {
  const res = await call(logout, {});
  assert.equal(res.statusCode, 200);
  assert.match(cookieHeader(res), /ds_staff=;.*Max-Age=0/);
});

/* ----------------------------------------------------------------- admin ---- */
async function signedInCookie() {
  const res = await call(login, { body: { code: '1290' } });
  return cookieHeader(res).split(';')[0];
}

test('admin routes are 401 without a session', async () => {
  assert.equal((await call(summary, { method: 'GET', url: '/api/admin/summary' })).statusCode, 401);
  assert.equal((await call(leadsRoute, { method: 'GET', url: '/api/admin/leads' })).statusCode, 401);
});

test('admin routes reject a tampered cookie', async () => {
  const cookie = await signedInCookie();
  // Swapping in a fixed character can be a no-op when the signature already ends
  // that way, which would leave this asserting that a VALID cookie is rejected.
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.notEqual(tampered, cookie, 'the tamper must actually change the cookie');
  const res = await call(summary, { method: 'GET', url: '/api/admin/summary', headers: { cookie: tampered } });
  assert.equal(res.statusCode, 401);
});

test('summary returns the expected shape and counts', async () => {
  const cookie = await signedInCookie();
  await call(event, { body: { sessionId: SID_A, type: 'page_view', referrer: 'https://www.google.com/', utm: { utm_medium: 'cpc' } } });
  await call(event, { body: { sessionId: SID_A, type: 'form_step', detail: { step: 1 } } });
  await call(event, { body: { sessionId: SID_A, type: 'call_click', detail: { placement: 'header' } } });
  await call(lead, { body: validLead({ stage: 'partial' }) });
  await call(lead, { body: validLead({ stage: 'complete' }) });

  const res = await call(summary, { method: 'GET', url: '/api/admin/summary?range=7d', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.counters.pageViews, 1);
  // Regression: the staff_login event written by signedInCookie() shares the
  // events table but is not a visit, so it must not show up as a session.
  assert.equal(data.counters.sessions, 1);
  assert.equal(data.counters.callClicks, 1);
  assert.equal(data.counters.partials, 1);
  assert.equal(data.counters.bookings, 1);
  assert.equal(data.counters.sessionToBooking, 100);
  assert.equal(data.funnel.step1, 1);
  assert.ok(Array.isArray(data.sources.byChannel));
  assert.equal(data.sources.byChannel[0].bookings, 1);
  assert.equal(data.sources.byChannel[0].bookingRate, 100);
});

test('summary and leads can be filtered to one site', async () => {
  const cookie = await signedInCookie();
  const london = { host: 'atidampsurvey.co.uk' };
  await call(event, { body: { sessionId: SID_B, type: 'page_view' }, headers: london });
  await call(lead, { body: validLead({ sessionId: SID_B }), headers: london });
  await call(event, { body: { sessionId: SID_A, type: 'page_view' } });
  await call(lead, { body: validLead() });

  const both = (await call(summary, { method: 'GET', url: '/api/admin/summary?range=7d', headers: { cookie } })).json();
  assert.equal(both.site, null);
  assert.equal(both.counters.bookings, 2, 'unfiltered shows both sites');

  const ldn = (await call(summary, { method: 'GET', url: '/api/admin/summary?range=7d&site=ati-london', headers: { cookie } })).json();
  assert.equal(ldn.site, 'ati-london');
  assert.equal(ldn.counters.bookings, 1);
  assert.equal(ldn.counters.pageViews, 1);

  const kentLeads = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=7d&site=dampscan', headers: { cookie } })).json();
  assert.equal(kentLeads.total, 1);
  assert.equal(kentLeads.leads[0].site, 'dampscan');
});

test('an unknown site filter is ignored rather than injected', async () => {
  const cookie = await signedInCookie();
  const res = await call(summary, {
    method: 'GET', url: "/api/admin/summary?range=7d&site=' or 1=1--", headers: { cookie }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().site, null, 'falls back to both sites');
});

test('summary range is whitelisted, a junk value falls back to 7d', async () => {
  const cookie = await signedInCookie();
  const res = await call(summary, {
    method: 'GET', url: "/api/admin/summary?range=all'; drop table leads; --", headers: { cookie }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().range, '7d');
  const { rows } = await pool.query(`select count(*)::int as n from information_schema.tables where table_name = 'leads'`);
  assert.equal(rows[0].n, 1, 'leads table still exists');
});

test('leads route paginates, filters by stage and attaches timelines', async () => {
  const cookie = await signedInCookie();
  await call(event, { body: { sessionId: SID_A, type: 'page_view', referrer: 'https://www.google.com/' } });
  await call(event, { body: { sessionId: SID_A, type: 'call_click', detail: { placement: 'footer' } } });
  await call(lead, { body: validLead({ stage: 'partial' }) });
  await call(lead, { body: validLead({ stage: 'complete' }) });

  const all = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=7d', headers: { cookie } })).json();
  assert.equal(all.total, 2);
  assert.equal(all.leads.length, 2);
  assert.equal(all.leads[0].timeline.length, 2, 'session timeline is attached');
  assert.equal(all.leads[0].channel, 'organic', 'attribution comes from the first event of the session');
  assert.equal(all.leads[0].previousSurvey, true);

  const booked = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=7d&stage=complete', headers: { cookie } })).json();
  assert.equal(booked.total, 1);
  assert.equal(booked.leads[0].stage, 'complete');

  const paged = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=7d&limit=1&offset=1', headers: { cookie } })).json();
  assert.equal(paged.leads.length, 1);
  assert.equal(paged.offset, 1);
});

test('leads limit is capped so one request cannot pull everything', async () => {
  const cookie = await signedInCookie();
  const res = (await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?limit=99999', headers: { cookie } })).json();
  assert.equal(res.limit, 200);
});

/* ------------------------------------------------------------------ jobs ---- */

async function createJob(cookie, over = {}) {
  return call(jobsRoute, {
    method: 'POST',
    url: '/api/admin/jobs',
    headers: { cookie },
    body: { surveyType: 'localised', surveyor: 'tom', customerName: 'A Customer', ...over }
  });
}

test('the jobs routes are 401 without a session', async () => {
  assert.equal((await call(jobsRoute, { method: 'GET', url: '/api/admin/jobs' })).statusCode, 401);
  assert.equal((await call(ratesRoute, { method: 'GET', url: '/api/admin/rates' })).statusCode, 401);
});

test('a job takes its price and surveyor fee from the rate card', async () => {
  const cookie = await signedInCookie();
  const res = await createJob(cookie);
  assert.equal(res.statusCode, 200);
  const { job } = res.json();
  assert.equal(job.surveyPricePence, 21500);
  assert.equal(job.surveyorFeePence, 10000);
  assert.deepEqual(job.pay, { scott: 2580, tom: 12310, ben: 2310 });
});

test('an explicit price overrides the rate card for a one off job', async () => {
  const cookie = await signedInCookie();
  const { job } = (await createJob(cookie, {
    surveyType: null, surveyPricePence: 50000, surveyorFeePence: 12000, surveyor: 'ben'
  })).json();
  assert.equal(job.surveyPricePence, 50000);
  // 500 -> 400 after tax -> 60 lead -> 120 surveyor -> 220 remainder -> 110 each
  assert.deepEqual(job.pay, { scott: 6000, tom: 11000, ben: 12000 + 11000 });
});

test('a job records the rates it was agreed at, and a later rate change does not move it', async () => {
  const cookie = await signedInCookie();
  const first = (await createJob(cookie)).json().job;
  assert.equal(first.rates.taxBp, 2000);
  assert.equal(first.pay.scott, 2580);

  // Put the lead fee up to 25% and the Localised survey to 250 pounds.
  const changed = await call(ratesRoute, {
    method: 'POST', url: '/api/admin/rates', headers: { cookie },
    body: {
      settings: { taxBp: 2000, leadBp: 2500, leadEarner: 'scott', partners: ['tom', 'ben'] },
      rates: [{ key: 'localised', label: 'Localised', pricePence: 25000, surveyorFeePence: 10000, position: 1 }]
    }
  });
  assert.equal(changed.statusCode, 200);

  // The job already saved is untouched.
  const listed = (await call(jobsRoute, { method: 'GET', url: '/api/admin/jobs?range=all', headers: { cookie } })).json();
  const stored = listed.jobs.find((j) => j.id === first.id);
  assert.equal(stored.pay.scott, 2580, 'an old job keeps what it earned');
  assert.equal(stored.rates.leadBp, 1500);

  // A new one picks the change up.
  const second = (await createJob(cookie)).json().job;
  assert.equal(second.surveyPricePence, 25000);
  assert.equal(second.rates.leadBp, 2500);
  assert.equal(second.pay.scott, 5000, '25% of 200.00');
});

test('editing a job keeps its original rates', async () => {
  const cookie = await signedInCookie();
  const created = (await createJob(cookie)).json().job;

  await call(ratesRoute, {
    method: 'POST', url: '/api/admin/rates', headers: { cookie },
    body: { settings: { taxBp: 4000, leadBp: 5000, leadEarner: 'scott', partners: ['tom', 'ben'] } }
  });

  // Add remedial work to the existing job.
  const edited = (await call(jobsRoute, {
    method: 'POST', url: '/api/admin/jobs', headers: { cookie },
    body: { id: created.id, surveyType: 'localised', surveyor: 'tom', remedialPence: 400000 }
  })).json().job;

  assert.equal(edited.id, created.id, 'updated, not duplicated');
  assert.equal(edited.rates.taxBp, 2000, 'still on the rates it was agreed at');
  assert.equal(edited.pay.scott, 2580 + 48000, 'lead fee on the survey and on the remedial work');
  assert.equal(edited.pay.tom, 12310, 'the remedial balance is settled offline, not paid here');
});

test('totals add up per person and ignore cancelled jobs', async () => {
  const cookie = await signedInCookie();
  await createJob(cookie, { surveyType: 'localised', surveyor: 'tom' });
  await createJob(cookie, { surveyType: 'premium', surveyor: 'scott' });
  await createJob(cookie, { surveyType: 'premium', surveyor: 'ben', status: 'cancelled' });

  const { totals, jobs } = (await call(jobsRoute, {
    method: 'GET', url: '/api/admin/jobs?range=all', headers: { cookie }
  })).json();

  assert.equal(jobs.length, 3, 'a cancelled job is still listed');
  assert.equal(totals.jobs, 2, 'but not counted');
  // Localised by Tom: scott 2580, tom 12310, ben 2310
  // Premium by Scott: scott 5400 + 19000, tom 5800, ben 5800
  assert.deepEqual(totals.pay, { scott: 2580 + 5400 + 19000, tom: 12310 + 5800, ben: 2310 + 5800 });
});

test('a lead can only become one job', async () => {
  const cookie = await signedInCookie();
  const leadRes = await call(lead, { body: validLead() });
  const leadId = leadRes.json().id;

  assert.equal((await createJob(cookie, { leadId })).statusCode, 200);
  const second = await createJob(cookie, { leadId });
  assert.equal(second.statusCode, 500, 'the unique index stops a lead being counted twice');
});

test('an unknown surveyor or survey type is refused', async () => {
  const cookie = await signedInCookie();
  const badPerson = await createJob(cookie, { surveyor: 'dave' });
  assert.equal(badPerson.statusCode, 400);
  assert.ok(badPerson.json().errors.surveyor);

  const badType = await createJob(cookie, { surveyType: 'mansion' });
  assert.equal(badType.statusCode, 400);
  assert.ok(badType.json().errors.surveyType);
});

test('a nonsense percentage is refused rather than stored', async () => {
  const cookie = await signedInCookie();
  const res = await call(ratesRoute, {
    method: 'POST', url: '/api/admin/rates', headers: { cookie },
    body: { settings: { taxBp: 20000, leadBp: 1500, leadEarner: 'scott', partners: ['tom', 'ben'] } }
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().errors.taxBp);

  const still = (await call(ratesRoute, { method: 'GET', url: '/api/admin/rates', headers: { cookie } })).json();
  assert.equal(still.settings.taxBp, 2000, 'unchanged');
});

test('a job can be deleted', async () => {
  const cookie = await signedInCookie();
  const created = (await createJob(cookie)).json().job;
  const res = await call(jobsRoute, {
    method: 'DELETE', url: '/api/admin/jobs', headers: { cookie }, body: { id: created.id }
  });
  assert.equal(res.statusCode, 200);
  const { jobs } = (await call(jobsRoute, { method: 'GET', url: '/api/admin/jobs?range=all', headers: { cookie } })).json();
  assert.equal(jobs.length, 0);
});

/* --------------------------------------------------------------- clients ---- */
async function bookedJob(cookie, extra = {}) {
  const leadRes = (await call(lead, { body: validLead({
    addressLine1: 'Flat 6, Trafalgar Point', addressLine2: '137 Downham Road', town: 'London',
    files: ['leads/2026-09-04/uuid-report.pdf'], notes: 'Back bedroom, since spring'
  }) })).json();
  const job = (await call(jobsRoute, { body: {
    leadId: leadRes.id, customerName: 'Priya', surveyType: 'full-house', surveyor: 'tom',
    jobDate: '2026-09-18', status: 'booked', ...extra
  }, headers: { cookie } })).json();
  return { leadId: leadRes.id, job: job.job };
}

test('a booked job is a client card, with the enquiry pulled through', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);

  const res = await call(clientsRoute, { method: 'GET', url: '/api/admin/clients', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const [c] = res.json().clients;
  assert.equal(c.id, job.id);
  assert.equal(c.name, 'Priya');
  assert.equal(c.email, 'priya@example.com');
  assert.deepEqual(c.address, { line1: 'Flat 6, Trafalgar Point', line2: '137 Downham Road', town: 'London', postcode: 'SE1 2AB' });
  assert.deepEqual(c.files, ['leads/2026-09-04/uuid-report.pdf']);
  assert.deepEqual(c.issues, ['Damp', 'Mould']);
  assert.equal(c.leadNotes, 'Back bedroom, since spring');
  assert.equal(c.surveyDate, '2026-09-18');
  assert.equal(c.survey.label, 'Full House');
  assert.equal(c.survey.pricePence, 29500);
});

test('the deposit is always half the price, derived rather than stored, odd penny on the deposit', async () => {
  const cookie = await signedInCookie();
  await bookedJob(cookie, { surveyType: null, surveyPricePence: 29501 });
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients', headers: { cookie } })).json().clients;
  assert.equal(c.money.depositPence, 14751);
  assert.equal(c.money.balancePence, 14750);
  assert.equal(c.money.depositPaidAt, null);
  assert.equal(c.money.paidAt, null);
});

test('ticking deposit stamps a time, ticking it again keeps it, unticking clears it', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);
  const post = (body) => call(clientsRoute, { body, headers: { cookie } });

  const first = (await post({ id: job.id, depositPaid: true })).json().client;
  assert.ok(first.money.depositPaidAt, 'ticked means a timestamp');
  assert.equal(first.money.paidAt, null, 'the other box is untouched');

  await new Promise((r) => setTimeout(r, 20));
  const again = (await post({ id: job.id, depositPaid: true, note: 'Rang to confirm' })).json().client;
  assert.equal(String(again.money.depositPaidAt), String(first.money.depositPaidAt),
    'saving the notes must not move the date the deposit was paid');
  assert.equal(again.note, 'Rang to confirm');

  const cleared = (await post({ id: job.id, depositPaid: false })).json().client;
  assert.equal(cleared.money.depositPaidAt, null);
});

test('paid in full implies the deposit was paid', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);
  const c = (await call(clientsRoute, { body: { id: job.id, paid: true }, headers: { cookie } })).json().client;
  assert.ok(c.money.paidAt);
  assert.ok(c.money.depositPaidAt, 'you cannot have paid the lot without the half');
});

test('the survey date and notes are editable from the card, and the job sees the same values', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);
  const c = (await call(clientsRoute, { body: { id: job.id, jobDate: '2026-09-25', note: 'Key with neighbour' }, headers: { cookie } })).json().client;
  assert.equal(c.surveyDate, '2026-09-25');
  assert.equal(c.note, 'Key with neighbour');

  const jobs = (await call(jobsRoute, { method: 'GET', url: '/api/admin/jobs?range=all', headers: { cookie } })).json().jobs;
  assert.equal(String(jobs[0].jobDate).slice(0, 10), '2026-09-25', 'one date, not two');
  assert.equal(jobs[0].note, 'Key with neighbour');
});

test('editing the job on the Jobs page does not clear the payment boxes', async () => {
  // The jobs route rewrites every column it knows about. It must not know
  // about these two.
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);
  await call(clientsRoute, { body: { id: job.id, paid: true }, headers: { cookie } });
  await call(jobsRoute, { body: { id: job.id, customerName: 'Priya S', surveyType: 'full-house', surveyor: 'tom', status: 'completed' }, headers: { cookie } });
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=archive', headers: { cookie } })).json().clients;
  assert.ok(c.money.paidAt, 'still paid');
  assert.equal(c.name, 'Priya S');
});

test('cancelled jobs are not clients, on any view', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie);
  await call(jobsRoute, { body: { id: job.id, surveyType: 'full-house', surveyor: 'tom', status: 'cancelled' }, headers: { cookie } });
  for (const view of ['upcoming', 'archive', 'all']) {
    const res = await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=' + view, headers: { cookie } });
    assert.deepEqual(res.json().clients, [], `a cancelled job showed up under ${view}`);
  }
});

/* Two days either side rather than one: the server decides "today" on London
   time and this test runs on whatever clock the machine has, and during the
   one hour a day they disagree a one-day margin would flake. */
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('a card archives itself the day after its survey date, without the job changing', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie, { jobDate: daysFromNow(-2) });
  const view = async (v) => (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=' + v, headers: { cookie } })).json().clients;

  assert.deepEqual(await view('upcoming'), [], 'a passed date is off the board');
  const [archived] = await view('archive');
  assert.equal(archived.id, job.id);
  assert.equal(archived.archived, true);
  assert.equal(archived.status, 'booked', 'archived by the calendar, not marked done: that is a person\'s call');
  assert.equal((await view('all')).length, 1);
});

test('a survey coming up is on the board and not archived', async () => {
  const cookie = await signedInCookie();
  await bookedJob(cookie, { jobDate: daysFromNow(2) });
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=upcoming', headers: { cookie } })).json().clients;
  assert.equal(c.archived, false);
  assert.deepEqual((await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=archive', headers: { cookie } })).json().clients, []);
});

test('a job marked completed is archived whatever its date', async () => {
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie, { jobDate: daysFromNow(2) });
  await call(jobsRoute, { body: { id: job.id, surveyType: 'full-house', surveyor: 'tom', status: 'completed', jobDate: daysFromNow(2) }, headers: { cookie } });
  assert.deepEqual((await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=upcoming', headers: { cookie } })).json().clients, []);
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=archive', headers: { cookie } })).json().clients;
  assert.equal(c.archived, true);
  assert.equal(c.status, 'completed');
});

test('moving the survey date forward from the card brings it back onto the board', async () => {
  // The rescheduling case, and the reason archive is a view and not a status.
  const cookie = await signedInCookie();
  const { job } = await bookedJob(cookie, { jobDate: daysFromNow(-2) });
  await call(clientsRoute, { body: { id: job.id, jobDate: daysFromNow(5) }, headers: { cookie } });
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=upcoming', headers: { cookie } })).json().clients;
  assert.equal(c.id, job.id);
  assert.equal(c.archived, false);
});

test('an unknown view falls back to upcoming rather than erroring', async () => {
  const cookie = await signedInCookie();
  const res = await call(clientsRoute, { method: 'GET', url: '/api/admin/clients?view=nonsense', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().view, 'upcoming');
});

test('a job recorded by hand, with no lead, is still a card', async () => {
  const cookie = await signedInCookie();
  await call(jobsRoute, { body: { customerName: 'Walk-in', customerPostcode: 'ME14 1AA', surveyType: 'localised', surveyor: 'ben' }, headers: { cookie } });
  const [c] = (await call(clientsRoute, { method: 'GET', url: '/api/admin/clients', headers: { cookie } })).json().clients;
  assert.equal(c.name, 'Walk-in');
  assert.equal(c.leadId, null);
  assert.equal(c.address.postcode, 'ME14 1AA');
  assert.deepEqual(c.files, []);
});

test('the clients route needs a session, rejects a bad id, and rejects an empty update', async () => {
  assert.equal((await call(clientsRoute, { method: 'GET', url: '/api/admin/clients' })).statusCode, 401);
  const cookie = await signedInCookie();
  assert.equal((await call(clientsRoute, { body: { id: 'x', paid: true }, headers: { cookie } })).statusCode, 400);
  assert.equal((await call(clientsRoute, { body: { id: 999999, paid: true }, headers: { cookie } })).statusCode, 404);
  const { job } = await bookedJob(cookie);
  assert.equal((await call(clientsRoute, { body: { id: job.id }, headers: { cookie } })).statusCode, 400);
  assert.equal((await call(clientsRoute, { body: { id: job.id, jobDate: 'next tuesday' }, headers: { cookie } })).statusCode, 400);
});
