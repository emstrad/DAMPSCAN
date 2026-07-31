/**
 * The area pages are generated and committed, because Vercel runs no build step.
 * That only works if the committed output actually matches the content, so this
 * rebuilds every page in memory and compares. A content edit without a rebuild
 * fails here rather than shipping a page that says something out of date.
 *
 * It also enforces the rule that makes area pages worth having at all: each one
 * has to say enough that is true only of that place. Twenty pages with a name
 * swapped into the same paragraph is the doorway page pattern, and it is
 * actively harmful rather than merely useless.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { areas } from '../content/areas/index.js';
import { render, distinctiveWordCount, SITES } from '../scripts/area-template.js';

const file = (a) => new URL(`../public/areas/${a.site}/${a.slug}.html`, import.meta.url);

test('there are area pages for both sites', () => {
  const bySite = {};
  for (const a of areas) bySite[a.site] = (bySite[a.site] || 0) + 1;
  assert.ok(bySite.dampscan >= 4, 'DampScan has area pages');
  assert.ok(bySite.ati >= 4, 'ATi has area pages');
});

test('every committed page matches what the generator produces now', async () => {
  for (const area of areas) {
    const onDisk = await readFile(file(area), 'utf8');
    assert.equal(
      onDisk,
      render(area, areas),
      `${area.site}/${area.slug} is stale. Run: npm run build:areas`
    );
  }
});

test('every page carries enough content that is only true of that area', () => {
  for (const area of areas) {
    const count = distinctiveWordCount(area);
    assert.ok(count >= 250, `${area.slug} has only ${count} distinctive words`);
  }
});

test('no two areas share their distinctive copy', () => {
  // Catches the failure this whole approach exists to avoid: one page written
  // and the rest copied with the name changed.
  const seen = new Map();
  for (const area of areas) {
    const body = [area.intro, ...area.stock].join(' ');
    for (const [slug, other] of seen) {
      assert.notEqual(body, other, `${area.slug} and ${slug} have identical copy`);
    }
    seen.set(area.slug, body);
  }
});

test('slugs are unique per site and URL safe', () => {
  const seen = new Set();
  for (const area of areas) {
    assert.match(area.slug, /^[a-z0-9-]+$/, `${area.slug} is not URL safe`);
    const key = `${area.site}/${area.slug}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  }
});

test('each page canonicals to its own public URL, not to the file path', async () => {
  for (const area of areas) {
    const html = await readFile(file(area), 'utf8');
    const expected = `${SITES[area.site].origin}/damp-survey/${area.slug}`;
    assert.ok(
      html.includes(`<link rel="canonical" href="${expected}" />`),
      `${area.slug} canonical should be ${expected}`
    );
    assert.equal(html.includes('/areas/'), false, `${area.slug} must not link to its own file path`);
  }
});

test('nearby links only point at pages that exist on the same site', () => {
  for (const area of areas) {
    for (const slug of area.nearby || []) {
      const target = areas.find((a) => a.slug === slug && a.site === area.site);
      assert.ok(target, `${area.slug} links to ${slug}, which is not an area on ${area.site}`);
    }
  }
});

test('both sitemaps list every area page for their own site and nothing else', async () => {
  for (const [site, name] of [['dampscan', 'sitemap.xml'], ['ati', 'sitemap-london.xml']]) {
    const xml = await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
    const origin = SITES[site].origin;
    for (const area of areas) {
      const loc = `<loc>${SITES[area.site].origin}/damp-survey/${area.slug}</loc>`;
      assert.equal(
        xml.includes(loc),
        area.site === site,
        `${name} ${area.site === site ? 'should list' : 'should not list'} ${area.slug}`
      );
    }
    assert.ok(xml.includes(`<loc>${origin}/</loc>`), `${name} lists the home page`);
  }
});

test('both home pages link to their own area pages', async () => {
  for (const [site, page] of [['dampscan', 'index.html'], ['ati', 'london.html']]) {
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    for (const area of areas) {
      const link = `href="/damp-survey/${area.slug}"`;
      assert.equal(
        html.includes(link),
        area.site === site,
        `${page} ${area.site === site ? 'should link to' : 'should not link to'} ${area.slug}`
      );
    }
  }
});

test('nothing is escaped twice', async () => {
  // The template escapes titles, headings and place names, so an HTML entity
  // written into the content is escaped again and renders literally on the page.
  for (const area of areas) {
    const html = await readFile(file(area), 'utf8');
    assert.equal(html.includes('&amp;amp;'), false, `${area.slug} has a double escaped entity`);
  }
});
