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

/* ------------------------------------------------------------- services ---- */

test('both sites have a full set of service pages', async () => {
  const { services } = await import('../content/services/index.js');
  const bySite = {};
  for (const s of services) bySite[s.site] = (bySite[s.site] || 0) + 1;
  assert.equal(bySite.dampscan, bySite.ati, 'both sites cover the same subjects');
  assert.ok(bySite.dampscan >= 8, 'at least eight services each');
});

test('every committed service page matches what the generator produces now', async () => {
  const { services } = await import('../content/services/index.js');
  const { render: renderService } = await import('../scripts/service-template.js');
  for (const service of services) {
    const onDisk = await readFile(
      new URL(`../public/service-pages/${service.site}/${service.slug}.html`, import.meta.url),
      'utf8'
    );
    assert.equal(onDisk, renderService(service, services), `${service.site}/${service.slug} is stale. Run: npm run build:pages`);
  }
});

test('the two sites never say the same thing about the same service', async () => {
  // This is the whole reason there are sixteen pages and not eight. Two pages
  // on two domains competing for one query means Google picks one and buries
  // the other, so any shared sentence here is wasted work at best.
  const { services } = await import('../content/services/index.js');
  const bySlug = new Map();
  for (const s of services) {
    const pair = bySlug.get(s.slug) || [];
    pair.push(s);
    bySlug.set(s.slug, pair);
  }
  for (const [slug, pair] of bySlug) {
    assert.equal(pair.length, 2, `${slug} should exist on both sites`);
    const [a, b] = pair;
    assert.notEqual(a.intro, b.intro, `${slug}: the two intros are identical`);
    assert.notEqual(a.h1, b.h1, `${slug}: the two headings are identical`);

    const sentences = (s) => s.sections.flatMap((sec) => sec.paras).join(' ')
      .split(/(?<=\.)\s+/).map((t) => t.trim()).filter((t) => t.split(/\s+/).length > 8);
    const shared = sentences(a).filter((t) => sentences(b).includes(t));
    assert.deepEqual(shared, [], `${slug}: shared sentences between the two sites`);
  }
});

test('every service page is written at length for its own site', async () => {
  const { services } = await import('../content/services/index.js');
  const { distinctiveWordCount: count } = await import('../scripts/service-template.js');
  for (const s of services) {
    assert.ok(count(s) >= 250, `${s.site}/${s.slug} has only ${count(s)} words`);
  }
});

test('service pages canonical to their public URL and link only within their site', async () => {
  const { services } = await import('../content/services/index.js');
  const { SITES } = await import('../scripts/area-template.js');
  for (const service of services) {
    const html = await readFile(
      new URL(`../public/service-pages/${service.site}/${service.slug}.html`, import.meta.url),
      'utf8'
    );
    const expected = `${SITES[service.site].origin}/services/${service.slug}`;
    assert.ok(html.includes(`<link rel="canonical" href="${expected}" />`), `${service.slug} canonical`);
    assert.equal(html.includes('/service-pages/'), false, `${service.slug} must not link to its own file path`);
    for (const slug of service.related || []) {
      assert.ok(
        services.some((s) => s.slug === slug && s.site === service.site),
        `${service.slug} links to ${slug}, which is not a service on ${service.site}`
      );
    }
  }
});

test('both home pages link to their own service pages, and the sitemaps list them', async () => {
  const { services } = await import('../content/services/index.js');
  const { SITES } = await import('../scripts/area-template.js');
  for (const [site, page, map] of [
    ['dampscan', 'index.html', 'sitemap.xml'],
    ['ati', 'london.html', 'sitemap-london.xml']
  ]) {
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    const xml = await readFile(new URL(`../public/${map}`, import.meta.url), 'utf8');
    for (const s of services.filter((x) => x.site === site)) {
      assert.ok(html.includes(`href="/services/${s.slug}"`), `${page} links to ${s.slug}`);
      assert.ok(xml.includes(`<loc>${SITES[site].origin}/services/${s.slug}</loc>`), `${map} lists ${s.slug}`);
    }
  }
});

test('each page carries its own SurveyMate slug and never the other site\'s', async () => {
  // The two firms have separate listings. A DampScan badge on a London page
  // would send an ATi visitor to the wrong firm's verification.
  const { areas } = await import('../content/areas/index.js');
  const { services } = await import('../content/services/index.js');
  const { SITES } = await import('../scripts/area-template.js');

  const pages = [
    ...areas.map((a) => [a.site, `../public/areas/${a.site}/${a.slug}.html`]),
    ...services.map((s) => [s.site, `../public/service-pages/${s.site}/${s.slug}.html`])
  ];

  for (const [site, path] of pages) {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');
    const mine = SITES[site].surveyMateSlug;
    const theirs = SITES[site === 'ati' ? 'dampscan' : 'ati'].surveyMateSlug;
    assert.ok(html.includes(`find-a-surveyor/${mine}`), `${path} links to its own listing`);
    assert.equal(html.includes(`find-a-surveyor/${theirs}`), false, `${path} must not link to the other firm`);
    assert.ok(html.includes(`verified-badge/${mine}`), `${path} shows its own badge`);
  }
});
