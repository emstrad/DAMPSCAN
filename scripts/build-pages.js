/**
 * Builds the area and service pages.
 *
 *   npm run build:pages
 *
 * Vercel runs no build step: `public/` is served exactly as it is on disk. So
 * this is an authoring tool, not a deploy step, and its output is committed.
 * The alternative, hand writing twenty near-identical documents, is how they
 * drift apart.
 *
 * Output lives under public/areas/<site>/<slug>.html and is served at
 * /damp-survey/<slug> on the right host by middleware.js. The two sites need
 * separate directories because one Vercel project serves both domains, so the
 * same public path would otherwise collide.
 */
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { areas } from '../content/areas/index.js';
import { services } from '../content/services/index.js';
import { guides } from '../content/guides/index.js';
import { regions } from '../content/regions/index.js';
import { render, SITES } from './area-template.js';
import { render as renderService } from './service-template.js';
import { render as renderGuide } from './guide-template.js';
import { check, checkService, checkGuide } from './content-checks.js';
import { reviewsBlock, reviewsSummary, START as R_START, END as R_END } from './reviews-block.js';
import { render as renderHub } from './hub-template.js';
import { render as renderPricing } from './pricing-template.js';
import { hubs } from '../content/hubs.js';
import { homes } from '../content/home/index.js';
import { render as renderHome } from './home-template.js';
import { pricing } from '../content/pricing.js';
import { assetHashes, stampAssets } from './asset-version.js';
import { bookForm } from './book-form.js';
import { adsTag } from './ads-tag.js';
import { writeSitemaps } from './sitemaps.js';
import { writeGalleryShells } from './gallery-shells.js';
import { writeTopicPages, checkTopics, TOPICS } from './topic-pages.js';
import { writeSeasonBlocks } from './season.js';
import { writeHomeLinks } from './home-links.js';
import { writeTownPages, checkTowns } from './town-pages.js';
import { writeProofingPages } from './proofing-pages.js';
import { towns } from '../content/kent-towns.js';
import { townDescription } from './seo-meta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'areas');
const SERVICES_OUT = join(ROOT, 'public', 'service-pages');
const HUBS_OUT = join(ROOT, 'public', 'hubs');
const GUIDES_OUT = join(ROOT, 'public', 'guide-pages');

/* The two hand written home pages. Generated blocks are written into them
   between markers: see home-links.js for why the area links matter. */
const HOME = { dampscan: 'public/index.html', ati: 'public/london.html' };

/* The booking form on the two home pages. It lived there as hand written markup
   and every other page generated its own from scripts/book-form.js, which is two
   copies of one form and they drifted: the home pages reworded their buttons,
   the generated pages did not, and a field added to one was missing from the
   other. Writing it here makes book-form.js the only copy. */
const BF_START = '<!-- book-form:start, filled by scripts/build-pages.js -->';
const BF_END = '<!-- book-form:end -->';

/* The Google Ads tag on the two home pages. Same reasoning as the booking form
   above: the generated pages get theirs from page-shell.js, and a second hand
   written copy in a head is how the two stop matching. A site with no tag
   configured writes an empty block, which is what keeps ATi's tag off
   DampScan. */
const AD_START = '<!-- ads-tag:start, filled by scripts/build-pages.js -->';
const AD_END = '<!-- ads-tag:end -->';

async function writeAdsTag() {
  for (const [site, file] of Object.entries(HOME)) {
    const path = join(ROOT, file);
    const html = await readFile(path, 'utf8');
    const from = html.indexOf(AD_START);
    const to = html.indexOf(AD_END);
    if (from === -1 || to === -1) throw new Error(`${file}: ads tag markers missing`);
    const tag = adsTag(site);
    const block = `${AD_START}\n${tag ? tag + '\n' : ''}${AD_END}`;
    await writeFile(path, html.slice(0, from) + block + html.slice(to + AD_END.length), 'utf8');
  }
}

async function writeBookForm() {
  for (const [site, file] of Object.entries(HOME)) {
    const path = join(ROOT, file);
    const html = await readFile(path, 'utf8');
    const from = html.indexOf(BF_START);
    const to = html.indexOf(BF_END);
    if (from === -1 || to === -1) throw new Error(`${file}: book form markers missing`);
    const block = `${BF_START}\n${bookForm(site)}\n    ${BF_END}`;
    await writeFile(path, html.slice(0, from) + block + html.slice(to + BF_END.length), 'utf8');
  }
}

/* The reviews we hold, written into the markup rather than fetched, because a
   crawler that does not run JavaScript sees only what is in the HTML. */
async function writeReviews() {
  for (const [site, file] of Object.entries(HOME)) {
    const path = join(ROOT, file);
    const html = await readFile(path, 'utf8');
    const from = html.indexOf(R_START);
    const to = html.indexOf(R_END);
    if (from === -1 || to === -1) throw new Error(`${file}: review markers missing`);
    await writeFile(path, html.slice(0, from) + reviewsBlock(site) + html.slice(to + R_END.length), 'utf8');
  }
}

/* Runs last, over every page the site serves, so that whatever the other
   passes wrote is what gets stamped. /assets is cached immutable for a year,
   and this is what makes that safe: see scripts/asset-version.js. */
async function stampAllPages() {
  const hashes = await assetHashes(ROOT);
  let stamped = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      /* The staff pages are no-store, but the shared /assets files they load (the viewer, motion, fit)
         are cached for a year like any other, so their pages, scripts and styles carry stamps too. */
      const staff = path.includes(`${join('public', 'staff')}`);
      if (!entry.name.endsWith('.html') && !(staff && /\.(js|css)$/.test(entry.name))) continue;
      const html = await readFile(path, 'utf8');
      const out = stampAssets(html, hashes);
      if (out !== html) { await writeFile(path, out, 'utf8'); stamped++; }
    }
  }
  await walk(join(ROOT, 'public'));
  return { files: hashes.size, stamped };
}

async function main() {
  const seen = new Set();
  const failures = [];

  for (const area of areas) {
    const problems = check(area, seen);
    if (problems.length) failures.push(`area ${area.slug || '(no slug)'}: ${problems.join(', ')}`);
  }
  const seenServices = new Set();
  /* Regions are service-shaped pages under the areas path, so they meet the
     same floor, and share the slug set so one cannot shadow a service. */
  for (const service of [...services, ...regions]) {
    const problems = checkService(service, seenServices);
    if (problems.length) failures.push(`service ${service.slug || '(no slug)'}: ${problems.join(', ')}`);
  }
  const seenGuides = new Set();
  for (const guide of guides) {
    const problems = checkGuide(guide, seenGuides);
    if (problems.length) failures.push(`guide ${guide.slug || '(no slug)'}: ${problems.join(', ')}`);
  }
  failures.push(...checkTopics());
  failures.push(...checkTowns());
  if (failures.length) {
    console.error('Page content is not ready to build:\n  ' + failures.join('\n  '));
    process.exit(1);
  }

  // Clear first, so renaming a slug does not leave the old page live for ever.
  await rm(OUT, { recursive: true, force: true });

  const counts = {};
  for (const area of areas) {
    const dir = join(OUT, area.site);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${area.slug}.html`), render(area, areas), 'utf8');
    counts[area.site] = (counts[area.site] || 0) + 1;
  }
  for (const region of regions) {
    const hub = { path: SITES[region.site].areasPath, label: 'Areas' };
    await mkdir(join(OUT, region.site), { recursive: true });
    await writeFile(join(OUT, region.site, `${region.slug}.html`), renderService(region, services, hub), 'utf8');
    counts[region.site] = (counts[region.site] || 0) + 1;
  }
  const townCount = await writeTownPages(ROOT);
  const proofingCount = await writeProofingPages(ROOT);
  /* A hub is written because somebody wrote its copy, not because the loop
     came round. A brand with no area pages should have no areas hub and no nav
     item pointing at one, rather than an empty page saying nothing follows. */
  await rm(HUBS_OUT, { recursive: true, force: true });
  const HUB_KINDS = {
    services: (site) => services.filter((s) => s.site === site),
    areas: (site) => [...areas, ...regions, ...towns.map((t) => ({ ...t, metaDescription: townDescription(t) }))].filter((a) => a.site === site),
    guides: (site) => guides.filter((g) => g.site === site),
    problems: (site) => TOPICS.problems.filter((p) => p.site === site),
    seasonal: (site) => TOPICS.seasonal.filter((p) => p.site === site)
  };
  let hubCount = 0;
  for (const site of Object.keys(SITES)) {
    const dir = join(HUBS_OUT, site);
    await mkdir(dir, { recursive: true });
    for (const [kind, pick] of Object.entries(HUB_KINDS)) {
      if (!hubs[site] || !hubs[site][kind] || !pick(site).length) continue;
      await writeFile(join(dir, `${kind}.html`), renderHub(kind, site, pick(site)), 'utf8');
      hubCount += 1;
    }
  }
  await rm(GUIDES_OUT, { recursive: true, force: true });
  for (const guide of guides) {
    const dir = join(GUIDES_OUT, guide.site);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${guide.slug}.html`), renderGuide(guide, guides, services), 'utf8');
  }

  // Both damp sites publish prices, for opposite reasons that content/pricing.js
  // explains: ATi because the survey is the whole transaction, DampScan because
  // paying for the survey separately is what keeps it independent of the works.
  // A brand that quotes every job has no entry there and gets no page, rather
  // than a price list it cannot honour.
  await mkdir(join(ROOT, 'public', 'pricing'), { recursive: true });
  let pricingCount = 0;
  for (const site of Object.keys(SITES)) {
    if (!pricing[site]) continue;
    await writeFile(join(ROOT, 'public', 'pricing', `${site}.html`), renderPricing(site), 'utf8');
    pricingCount += 1;
  }

  /* Home pages for the brands that have one written. DampScan and ATi are not
     here: index.html and london.html are hand written and this must not touch
     them. */
  for (const home of homes) {
    await writeFile(join(ROOT, 'public', `${home.site}.html`), renderHome(home, services), 'utf8');
  }

  await rm(SERVICES_OUT, { recursive: true, force: true });
  for (const service of services) {
    const dir = join(SERVICES_OUT, service.site);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${service.slug}.html`), renderService(service, services), 'utf8');
  }

  const topics = await writeTopicPages(ROOT);
  await writeSitemaps(ROOT);
  await writeSeasonBlocks(ROOT, HOME);
  await writeBookForm();
  await writeAdsTag();
  await writeHomeLinks(ROOT, HOME);
  await writeReviews();
  const stamps = await stampAllPages();
  const galleryCount = await writeGalleryShells(ROOT);

  for (const site of Object.keys(counts).sort()) {
    const built = await readdir(join(OUT, site));
    console.log(`${site}: ${built.length} pages`);
  }
  console.log(`${areas.length} area pages and ${townCount} Kent town pages written to public/areas`);
  console.log(`${proofingCount} damp proofing pages written to public/proofing-pages`);
  console.log(`${services.length} service pages written to public/service-pages`);
  console.log(`${guides.length} guide pages written to public/guide-pages`);
  console.log(`${topics.problems} problem and ${topics.seasonal} seasonal pages written`);
  console.log(`${hubCount} hub pages written to public/hubs`);
  console.log(`${pricingCount} pricing pages written to public/pricing`);
  console.log(`${homes.length} home page(s) generated: ${homes.map((h) => h.site).join(', ')}`);
  console.log('sitemaps, home page links, season features and booking forms rewritten');
  console.log(`${stamps.files} assets hashed, ${stamps.stamped} pages restamped`);
  console.log(`${galleryCount} gallery frame(s) written to lib/generated/gallery-shells.js`);
  for (const site of Object.keys(HOME)) console.log(reviewsSummary(site));
}

await main();
