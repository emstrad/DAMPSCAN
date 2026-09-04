/**
 * The postcode lookup.
 *
 * fetch is stubbed, so these cover the part that is ours: what happens with no
 * key, how a provider's response is normalised, and that nothing a provider
 * does can turn into a failed booking. The provider itself is not tested here,
 * because a test that calls getAddress.io is a test that fails when their
 * billing does.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { lookupAddresses } = await import('../lib/address.js');

const realFetch = globalThis.fetch;

/** Answers every request with one canned getAddress.io payload. */
function stubFetch(response) {
  globalThis.fetch = async () => response;
}

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  process.env.ADDRESS_API_KEY = 'test-key';
  delete process.env.ADDRESS_PROVIDER;
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

test('an unknown provider name behaves like no key at all', async () => {
  process.env.ADDRESS_PROVIDER = 'someone-we-never-wired-up';
  const out = await lookupAddresses('SE1 2AB');
  assert.equal(out.configured, false);
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
  stubFetch(okJson({ addresses: [
    { line_1: 'Flat 6', line_2: 'Trafalgar Point', line_3: '', line_4: '', town_or_city: 'London' }
  ] }));
  const { addresses } = await lookupAddresses('n13gz');
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].line1, 'Flat 6');
  assert.equal(addresses[0].line2, 'Trafalgar Point');
  assert.equal(addresses[0].town, 'London');
  assert.equal(addresses[0].label, 'Flat 6, Trafalgar Point, London');
});

test('an entry with nothing in its first line is discarded', async () => {
  stubFetch(okJson({ addresses: [
    { line_1: '', line_2: '', town_or_city: 'London' },
    { line_1: '12 Bridge Street', town_or_city: 'Maidstone' }
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
  stubFetch(okJson({ addresses: [
    { line_1: 'x'.repeat(400), town_or_city: 'y'.repeat(400) }
  ] }));
  const { addresses } = await lookupAddresses('SE1 2AB');
  assert.equal(addresses[0].line1.length, 120);
  assert.equal(addresses[0].town.length, 80);
});
