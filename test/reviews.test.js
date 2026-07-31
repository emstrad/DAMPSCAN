/**
 * Google reviews. The rule this file exists to hold: nothing is ever invented.
 * A missing key, a rejected key, a wrong place id or a malformed review all end
 * in an empty list, never in sample text presented as a customer's words.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGoogleReviews, placeIdFor } from '../lib/google-reviews.js';

const KEY = 'GOOGLE_MAPS_API_KEY';
const PLACE = 'GOOGLE_PLACE_ID_DAMPSCAN';

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => fn())().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function stubFetch(handler) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = real; };
}

function ok(body) {
  return async () => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
}

const GOOD = {
  displayName: { text: 'DampScan' },
  rating: 4.8,
  userRatingCount: 37,
  googleMapsUri: 'https://maps.google.com/?cid=1',
  reviews: [
    {
      rating: 5,
      originalText: { text: 'Found the leak in twenty minutes.' },
      authorAttribution: { displayName: 'A Customer', uri: 'https://example.test/a', photoUri: 'https://example.test/a.png' },
      publishTime: '2026-07-01T10:00:00Z'
    }
  ]
};

test('an unset key is reported, not guessed around', async () => {
  await withEnv({ [KEY]: undefined, [PLACE]: 'place-1' }, async () => {
    const r = await fetchGoogleReviews('dampscan');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no_api_key');
    assert.deepEqual(r.reviews, []);
  });
});

test('an unset place id is reported separately from a missing key', async () => {
  await withEnv({ [KEY]: 'k', [PLACE]: undefined }, async () => {
    const r = await fetchGoogleReviews('dampscan');
    assert.equal(r.reason, 'no_place_id');
  });
});

test('an unknown site has no place id variable at all', () => {
  assert.equal(placeIdFor('not-a-site'), '');
});

test('a real response is mapped to what the carousel renders', async () => {
  const restore = stubFetch(ok(GOOD));
  try {
    await withEnv({ [KEY]: 'k', [PLACE]: 'place-1' }, async () => {
      const r = await fetchGoogleReviews('dampscan');
      assert.equal(r.ok, true);
      assert.equal(r.place.total, 37);
      assert.equal(r.place.rating, 4.8);
      assert.equal(r.reviews.length, 1);
      assert.deepEqual(
        { text: r.reviews[0].text, attr: r.reviews[0].attr, src: r.reviews[0].src, rating: r.reviews[0].rating },
        { text: 'Found the leak in twenty minutes.', attr: 'A Customer', src: 'Google', rating: 5 }
      );
    });
  } finally { restore(); }
});

test('reviews missing text, author or a valid rating are dropped', async () => {
  const body = {
    ...GOOD,
    reviews: [
      { rating: 5, originalText: { text: 'Kept.' }, authorAttribution: { displayName: 'Real Person' } },
      { rating: 5, originalText: { text: '   ' }, authorAttribution: { displayName: 'No text' } },
      { rating: 5, originalText: { text: 'No author' }, authorAttribution: {} },
      { rating: 0, originalText: { text: 'Impossible rating' }, authorAttribution: { displayName: 'X' } },
      { rating: 4.5, originalText: { text: 'Half stars are not a thing' }, authorAttribution: { displayName: 'Y' } }
    ]
  };
  const restore = stubFetch(ok(body));
  try {
    await withEnv({ [KEY]: 'k', [PLACE]: 'place-1' }, async () => {
      const r = await fetchGoogleReviews('dampscan');
      assert.equal(r.reviews.length, 1);
      assert.equal(r.reviews[0].text, 'Kept.');
    });
  } finally { restore(); }
});

test('a listing with no reviews yet returns an empty list, not an error', async () => {
  const restore = stubFetch(ok({ displayName: { text: 'New Business' }, userRatingCount: 0 }));
  try {
    await withEnv({ [KEY]: 'k', [PLACE]: 'place-1' }, async () => {
      const r = await fetchGoogleReviews('dampscan');
      assert.equal(r.ok, true);
      assert.deepEqual(r.reviews, []);
      assert.equal(r.place.total, 0);
    });
  } finally { restore(); }
});

test("Google's own rejection reason is carried back, not swallowed", async () => {
  const restore = stubFetch(async () => ({
    ok: false, status: 403, text: async () => 'API key not authorized', json: async () => ({})
  }));
  try {
    await withEnv({ [KEY]: 'k', [PLACE]: 'place-1' }, async () => {
      const r = await fetchGoogleReviews('dampscan');
      assert.equal(r.ok, false);
      assert.match(r.reason, /http_403/);
      assert.match(r.reason, /not authorized/);
      assert.deepEqual(r.reviews, []);
    });
  } finally { restore(); }
});

test('a network failure degrades to empty rather than throwing', async () => {
  const restore = stubFetch(async () => { throw new Error('ENOTFOUND'); });
  try {
    await withEnv({ [KEY]: 'k', [PLACE]: 'place-1' }, async () => {
      const r = await fetchGoogleReviews('dampscan');
      assert.equal(r.ok, false);
      assert.match(r.reason, /unreachable/);
      assert.deepEqual(r.reviews, []);
    });
  } finally { restore(); }
});
