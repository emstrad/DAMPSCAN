/**
 * Host routing. Both domains run off one Vercel project, so the only thing
 * telling the two sites apart is the Host header. Getting this wrong serves the
 * wrong brand on a domain, which is why it is tested rather than eyeballed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';

const KENT = 'dampscan.co.uk';
const LONDON = 'atidampsurvey.co.uk';

function call(host, path) {
  const request = new Request(`https://${host}${path}`, { headers: { host } });
  return middleware(request);
}

/** The internal path a rewrite points at, or null if this is not a rewrite. */
function rewrittenTo(res) {
  const target = res.headers.get('x-middleware-rewrite');
  return target ? new URL(target).pathname : null;
}

function redirect(res) {
  return { status: res.status, to: res.headers.get('location') };
}

test('the London host gets the London page at the root', () => {
  assert.equal(rewrittenTo(call(LONDON, '/')), '/london.html');
  assert.equal(rewrittenTo(call(`www.${LONDON}`, '/')), '/london.html');
});

test('the Kent host is left alone at the root', () => {
  assert.equal(rewrittenTo(call(KENT, '/')), null);
});

test('the London host gets its own robots, sitemap and llms files', () => {
  assert.equal(rewrittenTo(call(LONDON, '/robots.txt')), '/robots-london.txt');
  assert.equal(rewrittenTo(call(LONDON, '/sitemap.xml')), '/sitemap-london.xml');
  assert.equal(rewrittenTo(call(LONDON, '/llms.txt')), '/llms-london.txt');
});

test('the Kent host keeps the default robots, sitemap and llms files', () => {
  for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
    assert.equal(rewrittenTo(call(KENT, path)), null, path);
  }
});

// Duplicate URLs are the thing to avoid here: the same document answering on
// two paths splits its own ranking signals.
test('index.html redirects to the root it duplicates', () => {
  assert.deepEqual(redirect(call(KENT, '/index.html')), {
    status: 301,
    to: 'https://dampscan.co.uk/'
  });
});

test('index.html on the London host goes to the site it actually belongs to', () => {
  assert.deepEqual(redirect(call(LONDON, '/index.html')), {
    status: 301,
    to: 'https://dampscan.co.uk/'
  });
});

test('london.html on the Kent host goes to the London domain', () => {
  assert.deepEqual(redirect(call(KENT, '/london.html')), {
    status: 301,
    to: 'https://atidampsurvey.co.uk/'
  });
});

test('london.html on the London host collapses to the root', () => {
  assert.deepEqual(redirect(call(LONDON, '/london.html')), {
    status: 301,
    to: 'https://atidampsurvey.co.uk/'
  });
});

// A preview deployment has neither production host, so there is nowhere to send
// the London page. It has to stay reachable as a file or previews cannot show it.
test('a preview deployment still serves london.html directly', () => {
  const res = call('dampscan-abc123.vercel.app', '/london.html');
  assert.equal(rewrittenTo(res), null);
  assert.equal(res.headers.get('location'), null);
});

test('a preview deployment serves the Kent site at the root', () => {
  assert.equal(rewrittenTo(call('dampscan-abc123.vercel.app', '/')), null);
});

test('a host with a port is matched on the hostname alone', () => {
  const host = `${LONDON}:3000`;
  const request = new Request(`https://${LONDON}/`, { headers: { host } });
  assert.equal(rewrittenTo(middleware(request)), '/london.html');
});
