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

/* Area pages. Both sites use /damp-survey/<slug>, and the host decides which
   file answers, so a wrong turn here serves the other brand's page. */
test('an area page resolves to the right site directory', () => {
  assert.equal(rewrittenTo(call(KENT, '/damp-survey/maidstone')), '/areas/dampscan/maidstone.html');
  assert.equal(rewrittenTo(call(LONDON, '/damp-survey/islington')), '/areas/ati/islington.html');
  assert.equal(rewrittenTo(call(`www.${LONDON}`, '/damp-survey/hackney')), '/areas/ati/hackney.html');
});

test('a preview deployment serves the Kent area pages', () => {
  assert.equal(
    rewrittenTo(call('dampscan-abc.vercel.app', '/damp-survey/brighton')),
    '/areas/dampscan/brighton.html'
  );
});

test('an area path that is not a plain slug is left alone', () => {
  // The matcher only offers these segments, but the handler is not allowed to
  // assume that: a path it does not recognise must fall through, not rewrite.
  for (const path of ['/damp-survey/a/b', '/damp-survey/UPPER']) {
    assert.equal(rewrittenTo(call(KENT, path)), null, path);
  }
});

test('the hubs resolve per host, and are what the nav points at', () => {
  assert.equal(rewrittenTo(call(KENT, '/damp-survey/')), '/hubs/dampscan/areas.html');
  assert.equal(rewrittenTo(call(LONDON, '/damp-survey/')), '/hubs/ati/areas.html');
  assert.equal(rewrittenTo(call(KENT, '/services/')), '/hubs/dampscan/services.html');
  assert.equal(rewrittenTo(call(LONDON, '/services/')), '/hubs/ati/services.html');
});

test('the bare hub path redirects to the trailing slash, so there is one URL', () => {
  for (const [from, to] of [['/services', '/services/'], ['/damp-survey', '/damp-survey/']]) {
    const res = call(KENT, from);
    assert.equal(res.status, 301, from);
    assert.equal(new URL(res.headers.get('location')).pathname, to, from);
  }
});

test('a service page resolves to the right site directory', () => {
  assert.equal(
    rewrittenTo(call(KENT, '/services/rising-damp')),
    '/service-pages/dampscan/rising-damp.html'
  );
  assert.equal(
    rewrittenTo(call(LONDON, '/services/rising-damp')),
    '/service-pages/ati/rising-damp.html'
  );
});

test('a service path that is not a plain slug is left alone', () => {
  for (const path of ['/services/a/b', '/services/UPPER']) {
    assert.equal(rewrittenTo(call(KENT, path)), null, path);
  }
});
