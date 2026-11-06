/**
 * The Google Ads tag goes on the site it belongs to and nowhere else.
 *
 * One Vercel project serves both domains from one public directory, so a tag
 * written into the shared shell without a site check lands on both. That is not
 * a cosmetic mistake: it reports DampScan's traffic as ATi conversions, which
 * corrupts the bidding on a live ad account and is close to invisible until the
 * numbers stop making sense.
 *
 * These check the built output rather than the template, because the output is
 * what Vercel serves and what a stale build would betray.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { adsTag, taggedSites } from '../scripts/ads-tag.js';

const ROOT = new URL('..', import.meta.url).pathname;
const ATI_ID = 'AW-18439115177';

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

/* Which site a built page belongs to. The generated pages say so on <html>,
   and the two home pages carry the same attribute. */
function siteOf(html) {
  const m = /<html[^>]*data-site="([^"]+)"/.exec(html);
  /* The damp pages carry a code, not a name (scripts/sites.js). */
  const codes = { s1: 'dampscan', s2: 'ati' };
  return m ? codes[m[1]] || m[1] : null;
}

test('a site with no tag configured gets no markup at all', () => {
  assert.equal(adsTag('dampscan'), '');
  assert.equal(adsTag('nonsense'), '');
  assert.match(adsTag('ati'), /AW-18439115177/);
  assert.deepEqual(taggedSites, ['ati']);
});

/* The conversion must never be fired by the page simply loading. Google's setup
   screen offers exactly that, and on a form that submits in place it would
   count every visitor on every page as a booking. */
test('the conversion action is a value for book.js, not an event in the head', async () => {
  const tag = adsTag('ati');
  assert.match(tag, /DS_ADS_CONVERSION/);
  assert.match(tag, /AW-18439115177\/BEE7CIGjvPIcEKmjuthE/);
  /* The account and the conversion action have to belong to each other. A
     send_to carrying a different account than the tag above is the mistake
     that sends conversions nowhere while everything appears to work. */
  const id = /gtag\('config', '(AW-[0-9]+)'\)/.exec(tag)[1];
  const target = /DS_ADS_CONVERSION = "(AW-[0-9]+)\//.exec(tag)[1];
  assert.equal(target, id, 'the conversion action must be in the same Ads account as the tag');
  assert.ok(!/gtag\(\s*'event'\s*,\s*'conversion'/.test(tag),
    'the head must not fire a conversion event on page load');

  const book = await readFile(join(ROOT, 'public/assets/book.js'), 'utf8');
  assert.match(book, /gtag\('event', 'conversion'/, 'book.js should fire the conversion');
  assert.match(book, /if \(result\.stored\) adsConversion/,
    'the conversion should only fire when the server stored the lead');
});

test('no built page fires a conversion on load', async () => {
  const pages = (await htmlFiles(join(ROOT, 'public'))).filter((p) => !p.includes('/staff/'));
  for (const path of pages) {
    const html = await readFile(path, 'utf8');
    assert.ok(!/gtag\(\s*['"]event['"]\s*,\s*['"]conversion['"]/.test(html),
      `${path} fires a Google Ads conversion on page load`);
  }
});

test('every ATi page carries the tag and no DampScan page does', async () => {
  const pages = (await htmlFiles(join(ROOT, 'public'))).filter((p) => !p.includes('/staff/'));
  const counts = { ati: 0, dampscan: 0 };

  for (const path of pages) {
    const html = await readFile(path, 'utf8');
    const site = siteOf(html);
    if (!site) continue;
    const tagged = html.includes(ATI_ID);

    if (site === 'ati') {
      assert.ok(tagged, `${path} is an ATi page with no Google Ads tag`);
      counts.ati++;
    } else {
      assert.ok(!tagged, `${path} is a ${site} page carrying ATi's Google Ads tag`);
      counts.dampscan++;
    }
  }

  assert.ok(counts.ati > 40, `expected the tag across ATi's pages, found ${counts.ati}`);
  assert.ok(counts.dampscan > 10, `expected DampScan pages to check against, found ${counts.dampscan}`);
});

test('the staff dashboard is never tagged', async () => {
  for (const path of await htmlFiles(join(ROOT, 'public', 'staff'))) {
    const html = await readFile(path, 'utf8');
    assert.ok(!html.includes(ATI_ID), `${path} carries the Google Ads tag`);
    assert.ok(!html.includes('googletagmanager'), `${path} loads gtag`);
  }
});

/* The notice is the site's own statement about what it does. A tag that
   contradicts it is the sort of thing nobody notices until somebody complains,
   so the contradiction is a test failure rather than a matter of memory. */
test('a tagged site does not claim it serves no advertising cookies', async () => {
  for (const file of ['public/index.html', 'public/london.html']) {
    const html = await readFile(join(ROOT, file), 'utf8');
    const site = siteOf(html);
    const claimsNone = /don't use advertising/.test(html);
    if (html.includes(ATI_ID)) {
      assert.ok(!claimsNone, `${file} loads an ads tag and still says it uses no advertising cookies`);
    } else if (site === 'dampscan') {
      assert.ok(claimsNone, `${file} carries no ads tag, so it should still say so`);
    }
  }
});
