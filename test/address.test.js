/**
 * The postcode lookup.
 *
 * fetch is stubbed, so these cover the part that is ours: what happens with no
 * key, how a provider's response is normalised, and that nothing a provider
 * does can turn into a failed booking. No test calls a real provider, which
 * matters more than it used to: the one this file used to name went out of
 * business, and a test suite that goes red when somebody else's company does
 * is not testing us.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { lookupAddresses } = await import('../lib/address.js');

const realFetch = globalThis.fetch;

/** Answers every request with one canned provider payload. */
function stubFetch(response) {
  globalThis.fetch = async () => response;
}

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  process.env.ADDRESS_API_KEY = 'test-key';
  delete process.env.ADDRESS_API_URL;
});

afterEach(() => { globalThis.fetch = realFetch; });

test('no key configured is reported as unconfigured, not as a failure', async () => {
  delete process.env.ADDRESS_API_KEY;
  stubFetch(okJson({ addresses: [] }));
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.ok, true);
  assert.equal(out.configured, false, 'the form types the address instead, which is not an error');
  assert.deepEqual(out.addresses, []);
});

test('a URL template with no postcode placeholder behaves like no key', async () => {
  // A misconfigured template would otherwise fire the same request at the
  // provider for every postcode and bill for it.
  process.env.ADDRESS_API_URL = 'https://api.example.com/lookup?key={key}';
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.configured, false);
});

test('the postcode and key are substituted, and both are URL encoded', async () => {
  let called = '';
  globalThis.fetch = async (url) => { called = url; return okJson({ result: [] }); };
  process.env.ADDRESS_API_URL = 'https://api.example.com/{postcode}?key={key}';
  process.env.ADDRESS_API_KEY = 'k/y+1';
  await lookupAddresses('n1 3gz');
  assert.equal(called, 'https://api.example.com/N1%203GZ?key=k%2Fy%2B1');
});

test('a postcode that is not one never reaches the provider', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return okJson({ addresses: [] }); };
  const out = await lookupAddresses('not a postcode');
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'bad_postcode');
  assert.equal(called, false, 'a metered call for input we can reject ourselves is a wasted one');
});

test('empty provider slots are dropped rather than left as blank lines', async () => {
  stubFetch(okJson({ result: [
    { line_1: 'Flat 6', line_2: 'Trafalgar Point', line_3: '', line_4: '', post_town: 'London' }
  ] }));
  const { addresses } = await lookupAddresses('n13gz');
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].line1, 'Flat 6');
  assert.equal(addresses[0].line2, 'Trafalgar Point');
  assert.equal(addresses[0].town, 'London');
  assert.equal(addresses[0].label, 'Flat 6, Trafalgar Point, London');
});

test('an entry with nothing in its first line is discarded', async () => {
  stubFetch(okJson({ result: [
    { line_1: '', line_2: '', post_town: 'London' },
    { line_1: '12 Bridge Street', post_town: 'Maidstone' }
  ] }));
  const { addresses } = await lookupAddresses('ME14 1AA');
  assert.deepEqual(addresses.map((a) => a.line1), ['12 Bridge Street']);
});

test('a postcode with no addresses is an empty list, not an error', async () => {
  stubFetch({ ok: false, status: 404 });
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.ok, true);
  assert.deepEqual(out.addresses, []);
});

test('a provider error is reported without ever throwing', async () => {
  stubFetch({ ok: false, status: 401 });
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'http_401');
  assert.deepEqual(out.addresses, []);
});

test('a provider that throws is caught, because a booking must not depend on it', async () => {
  globalThis.fetch = async () => { throw new Error('socket hang up'); };
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.ok, false);
  assert.deepEqual(out.addresses, []);
});

test('provider text is capped, since it ends up in the database', async () => {
  stubFetch(okJson({ result: [
    { line_1: 'x'.repeat(400), post_town: 'y'.repeat(400) }
  ] }));
  const { addresses } = await lookupAddresses('SE1 2AB');
  assert.equal(addresses[0].line1.length, 120);
  assert.equal(addresses[0].town.length, 80);
});

/* Every UK provider is reselling the same file under the same field names, so
   the parser is deliberately shape tolerant rather than written per provider.
   These pin that tolerance down. */
test('the address array is found wherever the provider puts it', async () => {
  const entry = { line_1: '12 Bridge Street', post_town: 'Maidstone' };
  for (const body of [{ result: [entry] }, { addresses: [entry] }, { results: [entry] }, [entry]]) {
    stubFetch(okJson(body));
    const out = await lookupAddresses('ME14 1AA');
    assert.equal(out.addresses.length, 1, `did not find the list in ${JSON.stringify(body).slice(0, 40)}`);
  }
});

test('a comma separated string is accepted as well as an object', async () => {
  stubFetch(okJson({ result: ['Flat 6, Trafalgar Point, London'] }));
  const { addresses } = await lookupAddresses('N1 3GZ');
  assert.equal(addresses[0].line1, 'Flat 6');
  assert.equal(addresses[0].line2, 'Trafalgar Point');
  assert.equal(addresses[0].town, 'London');
});

test('an all caps post town is title cased, because a form is not an envelope', async () => {
  stubFetch(okJson({ result: [
    { line_1: '1 High Street', post_town: 'ROYAL TUNBRIDGE WELLS' },
    { line_1: '2 High Street', post_town: "KING'S LYNN" },
    { line_1: '3 High Street', post_town: 'STOKE-ON-TRENT' },
    { line_1: '4 High Street', post_town: 'WESTON-SUPER-MARE' },
    { line_1: '5 High Street', post_town: 'ST ALBANS' },
    { line_1: '6 High Street', post_town: 'BARROW-IN-FURNESS' }
  ] }));
  const { addresses } = await lookupAddresses('TN1 1AA');
  assert.deepEqual(addresses.map((a) => a.town), [
    'Royal Tunbridge Wells', "King's Lynn", 'Stoke-on-Trent',
    'Weston-super-Mare', 'St Albans', 'Barrow-in-Furness'
  ]);
});

test('a town that is already mixed case is left alone', async () => {
  stubFetch(okJson({ result: [{ line_1: '1 High Street', post_town: 'London' }] }));
  const { addresses } = await lookupAddresses('SE1 2AB');
  assert.equal(addresses[0].town, 'London');
});

test('a response shaped like nothing we expect is empty, not a crash', async () => {
  stubFetch(okJson({ message: 'Invalid key', code: 4041 }));
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.ok, true);
  assert.deepEqual(out.addresses, []);
});
