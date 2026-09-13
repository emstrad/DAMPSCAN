/**
 * The guide pages. A guide is an article written for the search a person makes
 * before "book a survey", and the rules that keep the service pages honest
 * apply to it: written at length for its own site, never the same document on
 * both domains, served at a clean URL, and linked from somewhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guides } from '../content/guides/index.js';
import { services } from '../content/services/index.js';
import { render, distinctiveWordCount } from '../scripts/guide-template.js';
import { SITES } from '../scripts/area-template.js';
import { assetHashes, stampAssets } from '../scripts/asset-version.js';

const ROOT = new URL('..', import.meta.url).pathname;
const hashes = await assetHashes(ROOT);
const built = (html) => stampAssets(html, hashes);

test('both sites publish the treatment cost guide', () => {
  for (const site of ['dampscan', 'ati']) {
    assert.ok(guides.some((g) => g.site === site && g.slug === 'woodworm-and-rot-treatment-cost'), site);
  }
});

test('every committed guide page matches what the generator produces now', async () => {
  for (const guide of guides) {
    const onDisk = await readFile(`${ROOT}public/guide-pages/${guide.site}/${guide.slug}.html`, 'utf8');
    assert.equal(onDisk, built(render(guide, guides, services)), `${guide.site}/${guide.slug} is stale. Run: npm run build:pages`);
  }
});

test('every guide is written at length, and the two sites never share a sentence', () => {
  for (const g of guides) assert.ok(distinctiveWordCount(g) >= 250, `${g.site}/${g.slug} has only ${distinctiveWordCount(g)} words`);

  const bySlug = new Map();
  for (const g of guides) bySlug.set(g.slug, [...(bySlug.get(g.slug) || []), g]);
  for (const [slug, pair] of bySlug) {
    if (pair.length === 1) continue;
    const [a, b] = pair;
    assert.notEqual(a.intro, b.intro, `${slug}: identical intros`);
    assert.notEqual(a.h1, b.h1, `${slug}: identical headings`);
    assert.notEqual(a.title, b.title, `${slug}: identical titles`);
    const sentences = (g) => g.sections.flatMap((s) => s.paras).join(' ')
      .split(/(?<=\.)\s+/).map((t) => t.trim()).filter((t) => t.split(/\s+/).length > 8);
    const shared = sentences(a).filter((t) => sentences(b).includes(t));
    assert.deepEqual(shared, [], `${slug}: shared sentences between the two sites`);
  }
});

test('a guide canonicals to /guides/<slug>, carries Article data, and links only within its site', async () => {
  for (const guide of guides) {
    const html = await readFile(`${ROOT}public/guide-pages/${guide.site}/${guide.slug}.html`, 'utf8');
    const origin = SITES[guide.site].origin;
    assert.ok(html.includes(`<link rel="canonical" href="${origin}/guides/${guide.slug}" />`), `${guide.slug} canonical`);
    assert.equal(html.includes('/guide-pages/'), false, `${guide.slug} must not link to its own file path`);
    assert.ok(html.includes('"@type":"Article"'), `${guide.slug} has Article schema`);
    assert.ok(html.includes(`"datePublished":"${guide.published}"`), `${guide.slug} carries its date`);
    for (const slug of guide.related || []) {
      assert.ok(services.some((s) => s.slug === slug && s.site === guide.site), `${guide.slug} relates to ${slug}, not on ${guide.site}`);
    }
  }
});

test('guides are reachable: hub, home page, sitemap, footer, and the services they answer for', async () => {
  for (const [site, page, map] of [['dampscan', 'index.html', 'sitemap.xml'], ['ati', 'london.html', 'sitemap-london.xml']]) {
    const home = await readFile(`${ROOT}public/${page}`, 'utf8');
    const xml = await readFile(`${ROOT}public/${map}`, 'utf8');
    const hub = await readFile(`${ROOT}public/hubs/${site}/guides.html`, 'utf8');
    const origin = SITES[site].origin;
    assert.ok(xml.includes(`<loc>${origin}/guides</loc>`), `${map} lists the hub`);
    for (const g of guides.filter((x) => x.site === site)) {
      assert.ok(home.includes(`href="/guides/${g.slug}"`), `${page} links to ${g.slug}`);
      assert.ok(xml.includes(`<loc>${origin}/guides/${g.slug}</loc>`), `${map} lists ${g.slug}`);
      assert.ok(hub.includes(`href="/guides/${g.slug}"`), `${site} guides hub links ${g.slug}`);
    }
    const rot = await readFile(`${ROOT}public/service-pages/${site}/wet-and-dry-rot.html`, 'utf8');
    assert.ok(rot.includes('href="/guides/woodworm-and-rot-treatment-cost"'), `${site} rot page points at the guide`);
    assert.ok(rot.includes('href="/guides"'), `${site} footer links the guides hub`);
  }
});

test('the file paths are kept out of the index, on both hosts', async () => {
  for (const file of ['robots.txt', 'robots-london.txt']) {
    const robots = await readFile(`${ROOT}public/${file}`, 'utf8');
    assert.ok(robots.includes('Disallow: /guide-pages/'), file);
  }
});
