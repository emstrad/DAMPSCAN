/**
 * The Kent town pages, the "damp proofing in <place>" pages and the London
 * borough pages.
 *
 * The rule these pages live or die by: each one has to be worth reading in
 * its own right. Thirty pages with a town name swapped into one template is
 * the doorway page pattern, and Google demotes a whole site for it. So this
 * measures, from the committed HTML, how much text any two pages of a kind
 * share, and fails above 40%.
 *
 * The measure: the page's main column (not the header, footer, booking form
 * or the quoted Google reviews, which are quotations rather than our copy) is
 * reduced to lower case words, cut into overlapping five word runs, and for
 * each pair of pages we take the share of the smaller page's runs that also
 * appear in the other. 0 means nothing in common, 1 means one is contained in
 * the other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { towns } from '../content/kent-towns.js';
import { areas } from '../content/areas/index.js';
import { proofingPages, siteIndex, siteCount } from '../scripts/proofing-pages.js';
import { render as renderTown } from '../scripts/town-template.js';
import { render as renderProofing } from '../scripts/proofing-template.js';
import { assetHashes, stampAssets } from '../scripts/asset-version.js';
import { SITES } from '../scripts/sites.js';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const read = (rel) => readFileSync(PUBLIC + rel, 'utf8');
const hashes = await assetHashes(new URL('..', import.meta.url).pathname);

const townFile = (t) => `areas/dampscan/${t.slug}.html`;
const proofFile = (p) => `proofing-pages/${p.site}/${p.slug}.html`;

/** The main column as words, without the reviews. */
export function mainWords(html) {
  const from = html.indexOf('<div class="page-main">');
  const to = html.indexOf('<aside');
  return html.slice(from, to)
    .replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

function shingles(words, n = 5) {
  const out = new Set();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

/** Share of the smaller page's five word runs found in the other. */
export function shared(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let common = 0;
  for (const s of small) if (big.has(s)) common++;
  return common / small.size;
}

const LIMIT = 0.4;

function worstPair(files) {
  const pages = files.map((f) => ({ f, s: shingles(mainWords(read(f))) }));
  let worst = { score: 0 };
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const score = shared(pages[i].s, pages[j].s);
      if (score > worst.score) worst = { score, a: pages[i].f, b: pages[j].f };
    }
  }
  return worst;
}

test('there is a survey page and a damp proofing page for every Kent town', () => {
  assert.ok(towns.length >= 25, `only ${towns.length} towns`);
  for (const t of towns) {
    assert.ok(read(townFile(t)).length > 0, t.slug);
    assert.ok(proofingPages.some((p) => p.site === 'dampscan' && p.slug === t.slug), `${t.slug} has no proofing page`);
  }
});

test('committed town and proofing pages match the generators', () => {
  for (const t of towns) {
    assert.equal(read(townFile(t)), stampAssets(renderTown(t, towns), hashes), `${t.slug} is stale. Run: npm run build:pages`);
  }
  for (const p of proofingPages) {
    assert.equal(read(proofFile(p)), stampAssets(renderProofing(p, siteIndex(p), siteCount(p.site)), hashes), `${p.site}/${p.slug} is stale`);
  }
});

test('no two Kent town survey pages share 40% of their text', () => {
  const w = worstPair(towns.map(townFile));
  assert.ok(w.score < LIMIT, `${w.a} and ${w.b} share ${(w.score * 100).toFixed(1)}%`);
});

test('no two damp proofing pages on one site share 40% of their text', () => {
  for (const site of ['dampscan', 'ati']) {
    const w = worstPair(proofingPages.filter((p) => p.site === site).map(proofFile));
    assert.ok(w.score < LIMIT, `${w.a} and ${w.b} share ${(w.score * 100).toFixed(1)}%`);
  }
});

test('a town\'s survey page and its damp proofing page are different documents', () => {
  for (const t of towns) {
    const score = shared(shingles(mainWords(read(townFile(t)))), shingles(mainWords(read(`proofing-pages/dampscan/${t.slug}.html`))));
    assert.ok(score < LIMIT, `${t.slug}: survey and proofing pages share ${(score * 100).toFixed(1)}%`);
  }
});

test('no two London borough pages share 40% of their text', () => {
  const w = worstPair(areas.filter((a) => a.site === 'ati').map((a) => `areas/ati/${a.slug}.html`));
  assert.ok(w.score < LIMIT, `${w.a} and ${w.b} share ${(w.score * 100).toFixed(1)}%`);
});

test('town and proofing pages are long form', () => {
  for (const f of [...towns.map(townFile), ...proofingPages.filter((p) => p.site === 'dampscan').map(proofFile)]) {
    const n = mainWords(read(f)).length;
    assert.ok(n >= 1450 && n <= 2600, `${f} has ${n} words in its main column`);
  }
  for (const a of areas.filter((x) => x.site === 'ati')) {
    const n = mainWords(read(`areas/ati/${a.slug}.html`)).length;
    assert.ok(n >= 1250, `ati/${a.slug} has only ${n} words`);
  }
});

test('every town and proofing page has its own FAQ schema, canonical and breadcrumb', () => {
  const pages = [
    ...towns.map((t) => [townFile(t), `${SITES.dampscan.origin}/damp-survey/${t.slug}`]),
    ...proofingPages.map((p) => [proofFile(p), `${SITES[p.site].origin}/damp-proofing/${p.slug}`])
  ];
  for (const [file, url] of pages) {
    const html = read(file);
    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${file} canonical`);
    assert.ok(html.includes('"@type":"BreadcrumbList"'), `${file} has no breadcrumb schema`);
    assert.ok(html.includes('<p class="crumb">'), `${file} has no visible breadcrumb`);
    const faq = JSON.parse(html.match(/<script type="application\/ld\+json">(\{[^<]*"@type":"FAQPage"[^<]*)<\/script>/)[1]);
    assert.ok(faq.mainEntity.length >= 7, `${file} has ${faq.mainEntity.length} questions`);
    assert.equal(html.includes('/areas/') || html.includes('/proofing-pages/'), false, `${file} links to a file path`);
  }
});

test('proofing pages never offer to carry out damp proofing', () => {
  for (const p of proofingPages) {
    const html = read(proofFile(p));
    assert.match(html, /<h1>Damp proofing in [^<]*(survey first|independent survey first)<\/h1>/i, p.slug);
    assert.doesNotMatch(html, /workmanship guarantee|fixed[- ]price quote/i, p.slug);
  }
});

test('the sitemaps list every town and proofing page on their own site only', () => {
  const ds = read('sitemap.xml');
  const ati = read('sitemap-london.xml');
  for (const t of towns) assert.ok(ds.includes(`<loc>${SITES.dampscan.origin}/damp-survey/${t.slug}</loc>`), t.slug);
  for (const p of proofingPages) {
    const loc = `<loc>${SITES[p.site].origin}/damp-proofing/${p.slug}</loc>`;
    assert.ok((p.site === 'dampscan' ? ds : ati).includes(loc), loc);
    assert.equal((p.site === 'dampscan' ? ati : ds).includes(loc), false, loc);
  }
});

test('every page on the two damp sites lists every area page in its footer', () => {
  const samples = ['index.html', 'london.html', townFile(towns[0]), proofFile(proofingPages[0]), 'areas/ati/camden.html', 'guide-pages/dampscan/damp-survey-cost-kent.html'];
  for (const f of samples) {
    const html = read(f);
    const site = html.includes('data-site="s2"') ? 'ati' : 'dampscan';
    const nav = html.match(/<nav class="foot-areas"[\s\S]*?<\/nav>/);
    assert.ok(nav, `${f} has no footer area list`);
    for (const a of [...areas, ...towns].filter((x) => x.site === site)) {
      assert.ok(nav[0].includes(`href="/damp-survey/${a.slug}"`), `${f} footer misses ${a.slug}`);
    }
  }
});

test('DampScan shows its locality, never the street, and its schema names East Malling', () => {
  const home = read('index.html');
  assert.equal(/Cottenham/i.test(home), false, 'the street name must not be published');
  const lb = JSON.parse(home.match(/<script type="application\/ld\+json">\n(\{"@context":"https:\/\/schema.org","@type":"LocalBusiness"[^\n]*)\n/)[1]);
  assert.equal(lb.address.addressLocality, 'East Malling');
  assert.equal(lb.address.postalCode, 'ME19 6BY');
  assert.equal(lb.address.streetAddress, undefined);
  assert.equal(lb.telephone, '+447386225526');
  assert.ok(lb.geo && lb.geo.latitude && lb.geo.longitude);
  assert.ok(lb.sameAs.includes('https://share.google/kC2SRRJEFz5DqKXC9'));
  assert.ok(lb.areaServed.length > 20);
  assert.ok(read(townFile(towns[0])).includes('East Malling, Kent ME19'));
});
