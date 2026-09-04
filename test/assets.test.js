/**
 * Every script and stylesheet reference in shipped HTML carries the hash of
 * the file it points at.
 *
 * This is the check that stops a stale stamp shipping. /assets is served
 * immutable for a year, so a page that names /assets/book.js?v=OLD after
 * book.js has changed leaves every returning visitor running last month's
 * script against this month's markup. Editing an asset without running
 * `npm run build:pages` fails here rather than in a customer's browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assetHashes, stampAssets, stampedReferences, hashOf } from '../scripts/asset-version.js';

const ROOT = new URL('..', import.meta.url).pathname;

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

test('stampAssets versions js and css references and leaves everything else alone', () => {
  const hashes = new Map([['/assets/book.js', 'abcd1234'], ['/assets/book.css', '99887766']]);
  const html = `<link rel="stylesheet" href="/assets/book.css" />
<script src="/assets/book.js"></script>
<script src="/assets/missing.js"></script>
<img src="/assets/ati-mark.png" />
<link href="/assets/fonts/x.woff2" />`;
  const out = stampAssets(html, hashes);
  assert.match(out, /href="\/assets\/book\.css\?v=99887766"/);
  assert.match(out, /src="\/assets\/book\.js\?v=abcd1234"/);
  assert.match(out, /src="\/assets\/missing\.js"/, 'an unknown file is not made to look versioned');
  assert.match(out, /src="\/assets\/ati-mark\.png"/, 'images are not stamped, they are not in the map');
  assert.match(out, /href="\/assets\/fonts\/x\.woff2"/);
});

test('stamping is idempotent: an already stamped reference is restamped, not doubled', () => {
  // Hex on both sides: a stamp is eight hex characters, and the pattern only
  // recognises one that is, so the test data has to be as well.
  const hashes = new Map([['/assets/book.js', '9e100000']]);
  const out = stampAssets('<script src="/assets/book.js?v=01d00000"></script>', hashes);
  assert.equal(out, '<script src="/assets/book.js?v=9e100000"></script>');
});

test('hashOf changes with the content and is eight hex characters', () => {
  assert.match(hashOf('a'), /^[0-9a-f]{8}$/);
  assert.notEqual(hashOf('a'), hashOf('b'));
});

test('every asset reference in every shipped page matches the file it names', async () => {
  const hashes = await assetHashes(ROOT);
  assert.ok(hashes.has('/assets/book.js'), 'the asset map is reading the right directory');

  const pages = (await htmlFiles(join(ROOT, 'public')))
    .filter((p) => !p.includes('/staff/'));   // served no-store, never cached
  assert.ok(pages.length > 60, `expected the whole site, found ${pages.length} pages`);

  const stale = [];
  const unstamped = [];
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const ref of stampedReferences(html)) {
      const current = hashes.get(ref.path);
      if (!current) continue;   // a reference to a file that is not there is another test's problem
      if (!ref.version) unstamped.push(`${page.replace(ROOT, '')}: ${ref.path}`);
      else if (ref.version !== current) stale.push(`${page.replace(ROOT, '')}: ${ref.path} has ${ref.version}, file is ${current}`);
    }
  }
  assert.deepEqual(unstamped, [], 'unstamped asset references. Run npm run build:pages.');
  assert.deepEqual(stale, [], 'stale asset stamps. An asset changed without npm run build:pages.');
});
