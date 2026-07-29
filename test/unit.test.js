import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-abcdef';
process.env.IP_SALT = 'test-salt';

const { validateLead, normalisePostcode, sanitiseUtm } = await import('../lib/validate.js');
const { channelFor, deviceFor, referrerHost } = await import('../lib/attribution.js');
const { signSession, verifySession, parseCookies } = await import('../lib/session.js');
const { sanitiseDetail } = await import('../api/event.js');
const { splitStatements } = await import('../db/migrate.js');

const SID = '11111111-1111-4111-8111-111111111111';
const base = { stage: 'complete', sessionId: SID, firstName: 'Priya', email: 'a@b.co',
  postcode: 'se12ab', issues: ['Damp'], role: 'Homeowner' };

test('postcode normalisation', () => {
  assert.equal(normalisePostcode('se12ab'), 'SE1 2AB');
  assert.equal(normalisePostcode('  sw1a  1aa '), 'SW1A 1AA');
  assert.equal(normalisePostcode('TN13 1AA'), 'TN13 1AA');
  assert.equal(normalisePostcode('M1 1AE'), 'M1 1AE');
  assert.equal(normalisePostcode('not a postcode'), null);
  assert.equal(normalisePostcode('12345'), null);
});

test('valid complete lead passes and is normalised', () => {
  const r = validateLead(base);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.postcode, 'SE1 2AB');
  assert.equal(r.value.email, 'a@b.co');
});

test('email is lowercased and rejected when malformed', () => {
  assert.equal(validateLead({ ...base, email: 'A@B.CO' }).value.email, 'a@b.co');
  assert.equal(validateLead({ ...base, email: 'nope' }).errors.email, 'Please enter a valid email address.');
});

test('issues outside the allowed six are rejected', () => {
  const r = validateLead({ ...base, issues: ['Damp', 'Haunted'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.issues);
});

test('role outside the allowed five is rejected', () => {
  assert.equal(validateLead({ ...base, role: 'Wizard' }).errors.role, 'Please choose one.');
});

test('partial does not require issues or role, complete does', () => {
  const partial = validateLead({ stage: 'partial', sessionId: SID, firstName: 'P', email: 'a@b.co', postcode: 'SE1 2AB' });
  assert.equal(partial.ok, true, JSON.stringify(partial.errors));
  const complete = validateLead({ stage: 'complete', sessionId: SID, firstName: 'P', email: 'a@b.co', postcode: 'SE1 2AB' });
  assert.equal(complete.ok, false);
  assert.ok(complete.errors.issues && complete.errors.role);
});

test('phone optional, but must have 9+ digits when given', () => {
  assert.equal(validateLead({ ...base, phone: '' }).value.phone, null);
  assert.equal(validateLead({ ...base, phone: '07700 900123' }).value.phone, '07700 900123');
  assert.ok(validateLead({ ...base, phone: '12345' }).errors.phone);
});

test('malformed session id is rejected', () => {
  assert.ok(validateLead({ ...base, sessionId: 'abc' }).errors.sessionId);
});

test('oversized name is truncated, not rejected outright', () => {
  assert.equal(validateLead({ ...base, firstName: 'x'.repeat(200) }).value.firstName.length, 80);
});

test('utm is filtered to known keys', () => {
  const out = sanitiseUtm({ utm_source: 'google', evil: 'drop', utm_campaign: 'c' });
  assert.deepEqual(out, { utm_source: 'google', utm_campaign: 'c' });
});

test('channel: campaign parameters win over referrer', () => {
  assert.equal(channelFor({ utm: { utm_medium: 'cpc' }, referrer: 'https://www.google.com/' }), 'paid');
  assert.equal(channelFor({ utm: { utm_medium: 'ppc' } }), 'paid');
  assert.equal(channelFor({ utm: { gclid: '123' } }), 'paid');
  assert.equal(channelFor({ utm: { utm_medium: 'email' } }), 'email');
  assert.equal(channelFor({ utm: { utm_medium: 'social' } }), 'social');
});

test('channel: falls back to referrer host', () => {
  assert.equal(channelFor({}), 'direct');
  assert.equal(channelFor({ referrer: '' }), 'direct');
  assert.equal(channelFor({ referrer: 'https://www.google.com/search?q=damp' }), 'organic');
  assert.equal(channelFor({ referrer: 'https://duckduckgo.com/' }), 'organic');
  assert.equal(channelFor({ referrer: 'https://www.facebook.com/x' }), 'social');
  assert.equal(channelFor({ referrer: 'https://t.co/abc' }), 'social');
  assert.equal(channelFor({ referrer: 'https://mail.google.com/' }), 'email');
  assert.equal(channelFor({ referrer: 'https://someblog.co.uk/post' }), 'referral');
  assert.equal(channelFor({ referrer: 'garbage-not-a-url' }), 'direct');
});

test('channel: label-boundary matching, no loose substrings', () => {
  // Regressions. Substring matching classed these wrongly: dailymail as email
  // (contains "mail."), notgoogle as organic (contains "google.").
  assert.equal(channelFor({ referrer: 'https://www.dailymail.co.uk/news' }), 'referral');
  assert.equal(channelFor({ referrer: 'https://notgoogle.com/' }), 'referral');
  assert.equal(channelFor({ referrer: 'https://google-reviews-fake.net/' }), 'referral');
  // Webmail must beat search even though the host contains a search brand.
  assert.equal(channelFor({ referrer: 'https://mail.google.com/mail/u/0' }), 'email');
  assert.equal(channelFor({ referrer: 'https://mail.yahoo.com/' }), 'email');
  assert.equal(channelFor({ referrer: 'https://outlook.office.com/' }), 'email');
  assert.equal(channelFor({ referrer: 'https://us1.list-manage.com/track' }), 'email');
  // Real search and social still resolve, including ccTLDs and short links.
  assert.equal(channelFor({ referrer: 'https://www.google.co.uk/search' }), 'organic');
  assert.equal(channelFor({ referrer: 'https://lnkd.in/abc' }), 'social');
  assert.equal(channelFor({ referrer: 'https://x.com/post' }), 'social');
  assert.equal(channelFor({ referrer: 'https://m.facebook.com/x' }), 'social');
});

test('referrer host strips www', () => {
  assert.equal(referrerHost('https://www.google.com/x'), 'google.com');
  assert.equal(referrerHost(null), null);
});

test('device from user agent', () => {
  assert.equal(deviceFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
  assert.equal(deviceFor('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
  assert.equal(deviceFor('Mozilla/5.0 (Linux; Android 14; SM-S911B) Mobile Safari'), 'mobile');
  assert.equal(deviceFor(''), 'desktop');
});

test('event detail is limited to the allow-list', () => {
  const out = sanitiseDetail({ step: 2, placement: 'header', secret: 'x', field: 'email' });
  assert.deepEqual(out, { step: 2, placement: 'header', field: 'email' });
});

test('event detail is capped at 1KB', () => {
  const out = sanitiseDetail({ placement: 'p'.repeat(5000) });
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 1024);
  assert.ok(out.placement.length <= 120);
});

test('session cookie round-trips and rejects tampering', () => {
  const token = signSession({ sub: 1, email: 'a@b.co', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(verifySession(token).email, 'a@b.co');
  const [body, sig] = token.split('.');
  assert.equal(verifySession(`${body}x.${sig}`), null, 'edited payload must fail');
  assert.equal(verifySession(`${body}.${sig.slice(0, -1)}A`), null, 'edited signature must fail');
  assert.equal(verifySession('garbage'), null);
  assert.equal(verifySession(undefined), null);
});

test('expired session is rejected', () => {
  const token = signSession({ sub: 1, email: 'a@b.co', exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal(verifySession(token), null);
});

test('a session signed with a different secret is rejected', () => {
  const token = signSession({ sub: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  process.env.SESSION_SECRET = 'a-completely-different-secret-value-xyz';
  assert.equal(verifySession(token), null);
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-abcdef';
});

test('cookie parsing', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'a=1; ds_staff=xy%3Dz' } }), { a: '1', ds_staff: 'xy=z' });
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test('schema splitter ignores semicolons in comments and strings', () => {
  const parts = splitStatements(`
    -- a comment with ; inside
    create table t (a text default 'x;y');
    select 1;
  `);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes("'x;y'"));
  assert.equal(parts[1], 'select 1');
});
