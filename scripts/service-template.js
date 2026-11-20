/**
 * One service page.
 *
 * The two sites cover the same eight subjects and must not say the same thing
 * about them, because two pages on two domains you own competing for one query
 * means Google picks one and buries the other. They are written from the two
 * businesses' actual positions instead: DampScan writes for Kent homeowners and
 * buyers with a practical, house by house voice, ATi writes for London buyers,
 * solicitors and disrepair. Both survey only. Same subject, two genuinely different documents.
 *
 * The shared page shell and site details come from area-template.js, so the
 * area and service pages stay visually identical without a second copy of it.
 */
import { heroCta } from './hero-cta.js';
import { body as reviewText } from './reviews-block.js';
import { SITES, bookScripts, verifiedBadge } from './area-template.js';
import { shell, orCall } from './page-shell.js';
import { bookForm } from './book-form.js';
import { guides } from '../content/guides/index.js';
import { areaServed } from './home-template.js';
import { priceGuide } from '../content/price-guide.js';
import { reviews } from '../content/reviews/index.js';
import { MIN_REVIEWS } from '../lib/google-reviews.js';
import { areas } from '../content/areas/index.js';
import { topAreas } from '../content/area-groups.js';
import { proofingPages } from './proofing-pages.js';


const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Everything on the page that is written for this service on this site. */
export function distinctiveWordCount(service) {
  return words([
    service.intro,
    ...service.sections.flatMap((s) => [s.h2, ...s.paras, ...(s.list || [])]),
    ...(service.signs || []),
    ...service.faq.map((f) => f.q + ' ' + f.a)
  ].join(' '));
}

/**
 * A bulleted list inside a section, or nothing.
 *
 * Not a brand thing: "what is always in the quoted figure" is a list in any
 * trade, and prose that tries to be a list reads like an evasion. Damp has
 * none today, so this renders nothing for every existing page.
 */
export function sectionList(section) {
  if (!Array.isArray(section.list) || !section.list.length) return '';
  return `
    <ul class="ticks">
      ${section.list.map((item) => `<li>${item}</li>`).join('\n      ')}
    </ul>`;
}

/**
 * The "signs you have this" list, or nothing at all.
 *
 * It is a damp page pattern rather than a universal one: "signs of rising
 * damp" is a thing people search and "signs of a re-roof" is not. A trade that
 * has no such list gets no heading with nothing under it, rather than an empty
 * section, so the template carries a fourth and fifth brand without being
 * edited again.
 *
 * The indentation is inside the returned string, including the blank line that
 * follows it, so that a page with signs comes out byte for byte as it did when
 * this was written inline.
 */
function signsBlock(service) {
  if (!Array.isArray(service.signs) || !service.signs.length) return '';
  return `  <section class="sec">
    <h2>${esc(service.signsHeading)}</h2>
    <ul class="ticks">
      ${service.signs.map((s) => `<li>${s}</li>`).join('\n      ')}
    </ul>
  </section>

`;
}

const pounds = (n) => '£' + Number(n).toLocaleString('en-GB');

/* What this kind of job usually costs, from content/price-guide.js. Nothing
   at all until the owners have given a real range for it. */
function priceBlock(service) {
  const g = (priceGuide[service.site] || {})[service.slug];
  if (!g) return '';
  return `
  <section class="sec price-guide">
    <h2>What it usually costs</h2>
    <p class="price-range">${pounds(g.from)} to ${pounds(g.to)} <span>all in</span></p>
    <p>That is the range for ${esc(g.typical)}. Yours depends on the size, the access and what we find, so every job is priced after a free visit and the quote you get is fixed.</p>
  </section>
`;
}

/* Three real reviews, for the brands that show them on service pages, once
   the brand has enough for the home page to show them too. Words exactly as
   the customer wrote them, like everywhere else. */
function reviewsBlock(service, site) {
  const list = (reviews[site.key] || []).filter((r) => r.text);
  if (!site.reviewsOnServices || (reviews[site.key] || []).length < MIN_REVIEWS || !list.length) return '';
  return `
  <section class="sec quotes">
    <h2>What customers say</h2>
    ${list.slice(0, 3).map((r) => `<blockquote class="quote-card"><p>${reviewText(r.text)}</p><cite>${esc(r.author)}, on Google</cite></blockquote>`).join('\n    ')}
  </section>
`;
}

/* Links from each damp service page to the town pages Google already shows
   most, and to the hub. Town pages sit at positions 30 to 50; links from
   relevant pages are what tell a crawler they matter. Only on the brands with
   town pages, and not on the roofing regional pages that share this template. */
function whereBlock(service, site, hub) {
  if (hub !== SERVICES_HUB) return '';
  const top = topAreas(site.key, areas, 6);
  if (!top.length) return '';
  return `
  <section class="sec">
    <h2>Where we survey</h2>
    <ul class="chips">
      ${top.map((a) => `<li><a href="/damp-survey/${a.slug}">${esc(a.name)}</a></li>`).join('\n      ')}
    </ul>
    <p><a href="${site.areasPath || '/damp-survey'}">Every area we cover</a></p>
  </section>
`;
}

/* The damp proofing page is the topic's hub, so it links to every town's own
   damp proofing page and each links back (20 Nov 2026: Search Console showed
   "damp proofing kent" at 46 and the forty town pages linked from nowhere). */
function proofingBlock(service, site, hub) {
  if (hub !== SERVICES_HUB || service.slug !== 'damp-proofing') return '';
  const list = proofingPages.filter((p) => p.site === site.key);
  if (!list.length) return '';
  return `
  <section class="sec">
    <h2>Damp proofing advice by ${site.key === 'ati' ? 'borough' : 'town'}</h2>
    <ul class="chips">
      ${list.map((p) => `<li><a href="/damp-proofing/${p.slug}">${esc(p.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
`;
}

function schema(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

/* Recent finished jobs in this region, for a regional page of a brand that
   publishes them. The jobs live in the database and this page is static, so
   the section ships empty and hidden and /assets/work-near.js fills it from
   the gallery function; with no jobs yet it simply stays hidden. */
function workNear(service, site) {
  if (!service.postcodes || !site.galleryPath) return '';
  return `  <section class="sec" data-work-near="${esc(service.postcodes.join(' '))}" hidden>
    <h2>Recent jobs in ${esc(service.name)}</h2>
    <ul class="chips"></ul>
    <p><a href="${site.galleryPath}">See all our recent work</a></p>
  </section>
`;
}

/* Services sit under /services. The roofing regional pages share this shape
   and are served under the brand's areas path instead, so the URL, the
   breadcrumb and the area named in the schema follow the hub passed in. */
const SERVICES_HUB = { path: '/services', label: 'Services' };

export function render(service, allServices, hub = SERVICES_HUB) {
  const site = SITES[service.site];
  if (!site) throw new Error(`${service.slug}: unknown site "${service.site}"`);
  const url = `${site.origin}${hub.path}/${service.slug}`;

  const related = (service.related || [])
    .map((slug) => allServices.find((s) => s.slug === slug && s.site === service.site))
    .filter(Boolean);
  /* Guides this service points at. Looked up here rather than passed in, so a
     caller with just the services list, the tests included, gets the same page. */
  const reading = (service.reading || [])
    .map((slug) => guides.find((g) => g.slug === slug && g.site === service.site))
    .filter(Boolean);

  const serviceSchema = schema('Service', {
    name: service.name,
    serviceType: service.name,
    description: service.metaDescription,
    url,
    provider: { '@type': site.schemaType, name: site.brand, url: `${site.origin}/`, telephone: site.phone || undefined },
    areaServed: service.areaServed
      ? service.areaServed.map((name) => ({ '@type': 'AdministrativeArea', name }))
      : areaServed(site)
  });

  const faqSchema = schema('FAQPage', {
    mainEntity: service.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  /* Middle rung is the hub, a real page, not an anchor on the home page. */
  const crumbSchema = schema('BreadcrumbList', {
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: hub.label, item: `${site.origin}${hub.path}` },
      { '@type': 'ListItem', position: 3, name: service.name, item: url }
    ]
  });

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="${hub.path}">${esc(hub.label)}</a> / ${esc(service.name)}</p>

  <div class="hero">
    <h1>${esc(service.h1)}</h1>
    <p class="lede">${service.intro}</p>
    ${heroCta(service.site)}
  </div>

${signsBlock(service)}  ${service.sections.map((s) => `<section class="sec">
    <h2>${esc(s.h2)}</h2>
    ${s.paras.map((p) => `<p>${p}</p>`).join('\n    ')}${sectionList(s)}
  </section>`).join('\n\n  ')}

${priceBlock(service)}${reviewsBlock(service, site)}${workNear(service, site)}${proofingBlock(service, site, hub)}${whereBlock(service, site, hub)}  <section class="sec" id="faq">
    <h2>Questions</h2>
    ${service.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${related.length || reading.length ? `
  <section class="sec">
    <h2>Related</h2>
    <ul class="chips">
      ${related.map((r) => `<li><a href="/services/${r.slug}">${esc(r.name)}</a></li>`).join('\n      ')}
      ${reading.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
` : ''}`;

  const aside = `
    <div class="booking">
      <h2>${esc(service.ctaHeading)}</h2>
      <p>${service.ctaBody}${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: service.title,
    metaDescription: service.metaDescription,
    schemas: [serviceSchema, crumbSchema, faqSchema],
    body,
    aside,
    scripts: bookScripts(site) + (workNear(service, site) ? '\n<scr' + 'ipt src="/assets/work-near.js" defer></scr' + 'ipt>' : '')
  });
}
