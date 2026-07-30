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
  await pool.query('truncate leads, events, rate_hits, staff_users restart identity cascade');
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
