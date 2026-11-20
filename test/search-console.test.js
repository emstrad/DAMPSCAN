/**
 * Search Console in Insights: off without a key, a correctly signed Google
 * sign-in with one, the right windows asked for, and a property the account
 * cannot see reported as such rather than as an empty site.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ACCOUNT = { client_email: 'insights@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

const sc = await import('../lib/search-console.js');

test('without a key nothing is asked of Google', async () => {
  delete process.env.GSC_SERVICE_ACCOUNT;
  assert.equal(sc.searchConsoleConfigured(), false);
  assert.equal(await sc.searchFor('roofing'), null);
});

test('the sign-in is a JWT signed with the service account key, for read-only Search Console', () => {
  const jwt = sc.assertion(ACCOUNT, 1_700_000_000);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, ACCOUNT.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claims.exp - claims.iat, 3600);
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')));
});

test('figures come back for the brand, and a property not shared with the account says so', async () => {
  process.env.GSC_SERVICE_ACCOUNT = JSON.stringify(ACCOUNT);
  const asked = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    const property = decodeURIComponent(String(url).split('/sites/')[1].split('/')[0]);
    const body = JSON.parse(init.body);
    asked.push([property, body.dimensions ? body.dimensions[0] : 'total']);
    if (property === 'sc-domain:coolright.co.uk') return new Response('{}', { status: 403 });
    if (!body.dimensions) return new Response(JSON.stringify({ rows: [{ clicks: 40, impressions: 2000, ctr: 0.02, position: 11.26 }] }));
    return new Response(JSON.stringify({ rows: [{ keys: [body.dimensions[0] === 'query' ? 'roofers orpington' : 'https://vergeroofing.com/roofing-in/kent-and-south-east-london'], clicks: 9, impressions: 300, position: 6.04 }] }));
  });
  try {
    const r = await sc.searchFor('roofing');
    assert.deepEqual(r.now, { clicks: 40, impressions: 2000, ctr: 2, position: 11.3 });
    assert.equal(r.queries[0].key, 'roofers orpington');
    assert.match(r.pages[0].key, /roofing-in/);
    assert.deepEqual(asked.filter((a) => a[0] === 'sc-domain:vergeroofing.com').map((a) => a[1]).sort(), ['page', 'query', 'total', 'total']);
    assert.equal((await sc.searchFor('ac')).error, 'not_shared');
  } finally {
    fetchMock.mock.restore();
    delete process.env.GSC_SERVICE_ACCOUNT;
  }
});

test('a key pasted badly is still read, and one that cannot be says why (20 Nov 2026, pasted from a phone)', async () => {
  const { readKey } = await import('../lib/search-console.js');
  const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
  const file = JSON.stringify({ type: 'service_account', client_email: 'search-reader@x.iam.gserviceaccount.com', private_key: pem }, null, 2);
  for (const pasted of [file, `﻿  ${file}\n`, file.replace(/"/g, '“'), Buffer.from(file).toString('base64'), file.replace(/\\n/g, '\n')]) {
    const k = readKey(pasted);
    assert.equal(k.state, 'ok', pasted.slice(0, 20));
    assert.equal(k.email, 'search-reader@x.iam.gserviceaccount.com');
    assert.match(k.account.private_key, /^-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----/);
  }
  assert.equal(readKey('').state, 'missing');
  assert.match(readKey('{"client_email": "a@b.iam.gserviceaccount.com"}').why, /private key/);
});
