/**
 * What the Leads tab says about each notification email.
 *
 * A lead used to show "Failed" or "Pending" and nothing else, so an email that
 * never arrived had no explanation anyone could act on. And a step 1 dropout
 * who left the page was saved without any email at all. These pin down the
 * wording for every outcome, that the beacon a dropout leaves with records its
 * email, and that the reason reaches staff.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'lead-email-test-secret-long-enough-x';
process.env.IP_SALT = 'lead-email-test-salt';
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

/* FormSubmit, stubbed: every send is kept, and it can be told to refuse. */
let sends = [];
let formsubmit = 'ok';
globalThis.fetch = async (url, init) => {
  sends.push({ url, headers: init.headers, body: new URLSearchParams(init.body) });
  if (formsubmit === 'down') throw new Error('fetch failed');
  if (formsubmit === 'challenge') return { status: 403, text: async () => '<html>Just a moment...</html>' };
  return { status: 200, text: async () => '{"success":"true","message":"The form was submitted successfully."}' };
};

const { emailStatus, explainError } = await import('../lib/email-status.js');
const { leadEmailFields, formSubmitUrl } = await import('../lib/lead-email.js');
const lead = (await import('../api/lead.js')).default;
const notified = (await import('../api/notified.js')).default;
const login = (await import('../lib/routes/auth/login.js')).default;
const leadsRoute = (await import('../lib/routes/admin/leads.js')).default;

function makeReq({ method = 'POST', url = '/api/lead', body, headers = {} } = {}) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.9' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }

const SID = '55555555-5555-4555-8555-555555555555';
const partial = (over = {}) => ({
  stage: 'partial', sessionId: SID, firstName: 'Priya', email: 'priya@example.com', postcode: 'ME14 1AA', ...over
});
const beacon = async (sid) => (await pool.query('select notify_beacon_at, notified_at, notify_error from leads where session_id = $1', [sid])).rows[0];

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, staff_users restart identity cascade');
  sends = [];
  formsubmit = 'ok';
});
after(async () => { await pool.end(); });

/* ------------------------------------------------------------ wording ---- */
test('every outcome has a label and a reason a person can act on', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const old = '2026-09-30T11:00:00Z';
  assert.equal(emailStatus({ notified_at: old, created_at: old }, now).label, 'Sent');

  const failed = emailStatus({ notify_error: 'Failed to fetch', created_at: old }, now);
  assert.equal(failed.label, 'Failed');
  assert.match(failed.reason, /ad blocker/);
  assert.equal(failed.raw, 'Failed to fetch', 'the browser\'s own words are kept for anyone who wants them');

  const exit = emailStatus({ notify_beacon_at: old, created_at: old }, now);
  assert.equal(exit.label, 'Sent on exit');
  assert.match(exit.reason, /left the page/);

  assert.equal(emailStatus({ created_at: '2026-09-30T11:59:30Z' }, now).label, 'Sending', 'a new lead may still be waiting on FormSubmit');
  const silent = emailStatus({ created_at: old }, now);
  assert.equal(silent.label, 'No reply');
  assert.match(silent.reason, /never reported back/);
});

test('a confirmed send wins over anything recorded before it', () => {
  const s = emailStatus({ notified_at: '2026-09-30T11:00:00Z', notify_beacon_at: '2026-09-30T10:00:00Z', created_at: '2026-09-30T10:00:00Z' });
  assert.equal(s.state, 'sent');
});

test('browser jargon becomes a sentence, and FormSubmit\'s own message is passed on', () => {
  for (const raw of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    assert.match(explainError(raw), /could not reach FormSubmit/, raw);
  }
  assert.match(explainError('This form needs Activation. We\'ve sent you an email'), /needs activating/);
  assert.match(explainError('FormSubmit did not confirm the send.'), /did not say it had sent/);
  assert.equal(explainError('Too many submissions'), 'FormSubmit said: Too many submissions');
  assert.equal(explainError(''), 'No reason was given.');
});

/* ------------------------------------------------- the exit beacon ---- */
test('a dropout that left with its email says so on the lead', async () => {
  const res = await call(lead, { body: partial({ emailedOnLeave: true }) });
  assert.equal(res.statusCode, 200);
  const row = await beacon(SID);
  assert.ok(row.notify_beacon_at, 'stamped as sent on exit');
  assert.equal(row.notified_at, null, 'not claimed as confirmed, because nobody could confirm it');
});

test('without the flag nothing is claimed, and a later save does not wipe it', async () => {
  await call(lead, { body: partial() });
  assert.equal((await beacon(SID)).notify_beacon_at, null);
  await call(lead, { body: partial({ emailedOnLeave: true }) });
  const stamped = (await beacon(SID)).notify_beacon_at;
  assert.ok(stamped);
  await call(lead, { body: partial({ emailedOnLeave: false }) });
  assert.deepEqual((await beacon(SID)).notify_beacon_at, stamped);
});

test('only a real true counts, so a stray string cannot stamp the lead', async () => {
  await call(lead, { body: partial({ emailedOnLeave: 'yes' }) });
  assert.equal((await beacon(SID)).notify_beacon_at, null);
});

/* ------------------------------------------------------- staff view ---- */
test('staff see the reason with each lead', async () => {
  formsubmit = 'down';
  await call(lead, { body: partial() });
  await call(notified, { url: '/api/notified', body: { sessionId: SID, stage: 'partial', ok: false, error: 'Load failed' } });

  const raw = (await call(login, { url: '/api/auth/login', body: { code: '1290' } })).getHeader('set-cookie');
  const cookie = (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
  const res = await call(leadsRoute, { method: 'GET', url: '/api/admin/leads?range=all', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const [row] = res.json().leads;
  assert.equal(row.email, 'priya@example.com', 'the customer\'s address is still where it was');
  assert.equal(row.emailed.label, 'Failed');
  assert.match(row.emailed.reason, /could not reach FormSubmit/);
  assert.equal(row.emailed.raw, 'Load failed');
});

/* ------------------------------------------------- the server's send ---- */
test('the server emails the lead as it lands, and tells the page not to', async () => {
  const res = await call(lead, { body: partial({ phone: '07700 900123', sourcePath: '/areas/maidstone' }) });
  assert.equal(res.json().emailed, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, 'https://formsubmit.co/ajax/tom@atidampsurvey.co.uk');
  assert.equal(sends[0].headers.Origin, 'https://dampscan.co.uk');
  assert.equal(sends[0].headers.Referer, 'https://dampscan.co.uk/areas/maidstone');
  assert.equal(sends[0].body.get('_subject'), 'PARTIAL lead (step 1), Priya, ME14 1AA');
  assert.equal(sends[0].body.get('Email'), 'priya@example.com');
  assert.equal(sends[0].body.get('Lead ID'), String(res.json().id));
  const row = await beacon(SID);
  assert.ok(row.notified_at, 'confirmed by FormSubmit, so it is Sent');
  assert.equal(row.notify_error, null);
});

test('when the server cannot send, the reason is kept and the page is told to try', async () => {
  formsubmit = 'challenge';
  const res = await call(lead, { body: partial() });
  assert.equal(res.json().emailed, false);
  const row = await beacon(SID);
  assert.equal(row.notified_at, null);
  assert.match(row.notify_error, /^Server send: .*bot check/);
  assert.match(emailStatus({ ...row, created_at: '2026-01-01T00:00:00Z' }).reason, /bot check stopped the server/);

  /* The page's own send then succeeds and its report wins. */
  await call(notified, { url: '/api/notified', body: { sessionId: SID, stage: 'partial', ok: true } });
  const after = await beacon(SID);
  assert.ok(after.notified_at);
  assert.equal(after.notify_error, null);
});

test('no second copy: not for a dropout whose page emailed, nor for a lead already sent', async () => {
  await call(lead, { body: partial({ emailedOnLeave: true }) });
  assert.equal(sends.length, 0, 'the page already sent it as it closed');

  await call(lead, { body: partial({ sessionId: '66666666-6666-4666-8666-666666666666' }) });
  assert.equal(sends.length, 1);
  await call(lead, { body: partial({ sessionId: '66666666-6666-4666-8666-666666666666', notes: 'again' }) });
  assert.equal(sends.length, 1, 'a resubmission of a sent lead is not emailed twice');
});

test('step 1 is saved quietly at once, and the finished form replaces that draft', async () => {
  const sid = '77777777-7777-4777-8777-777777777777';
  await call(lead, { body: partial({ sessionId: sid, quiet: true }) });
  assert.equal(sends.length, 0, 'nobody is emailed for the quiet save');
  assert.ok(await beacon(sid), 'but the name and contact are kept');
  await call(lead, { body: partial({ sessionId: sid }) });
  assert.equal(sends.length, 1, 'leaving afterwards still sends the dropout email');
  const done = '88888888-8888-4888-8888-888888888888';
  await call(lead, { body: partial({ sessionId: done, quiet: true }) });
  await call(lead, { body: { ...partial({ sessionId: done }), stage: 'complete', addressLine1: '1 High St', town: 'Maidstone', issues: ['Damp'], phone: '07700 900123' } });
  const stages = (await pool.query('select stage from leads where session_id = $1 order by stage', [done])).rows.map((r) => r.stage);
  assert.deepEqual(stages, ['complete'], 'the quiet draft of a finished form is gone, so it never reads as a failed form');
});

test('each brand emails its own address with its own wording', async () => {
  const value = { firstName: 'Sam', email: 's@example.com', postcode: 'N1 3GZ', issues: ['Flat roof'], files: ['leads/a.jpg'] };
  assert.equal(formSubmitUrl('ati'), 'https://formsubmit.co/ajax/team@atidampsurvey.co.uk');
  assert.equal(formSubmitUrl('ati-london'), formSubmitUrl('ati'));
  assert.equal(leadEmailFields({ site: 'ati-london', stage: 'complete', value, id: 1 })._subject, 'ATI London, NEW survey booking, Sam, N1 3GZ');
  const roof = leadEmailFields({ site: 'roofing', stage: 'complete', value, id: 2 });
  assert.equal(roof._subject, 'Verge Roofing, NEW quote request, Sam, N1 3GZ');
  assert.equal(roof['Attachment 1'], 'https://vergeroofing.com/api/admin/attachment?path=leads%2Fa.jpg');
  assert.equal(leadEmailFields({ site: 'ac', stage: 'partial', value, id: 3 })._subject, 'CoolRight, PARTIAL enquiry (step 1), Sam, N1 3GZ');
  assert.throws(() => formSubmitUrl('surveymate'), /no lead email definition/);
});

test('a CoolRight lead goes to CoolRight', async () => {
  await call(lead, { body: partial({ issues: [] }), headers: { host: 'coolright.co.uk' } });
  assert.equal(sends[0].url, 'https://formsubmit.co/ajax/team@coolright.co.uk');
  assert.equal(sends[0].headers.Origin, 'https://coolright.co.uk');
});
