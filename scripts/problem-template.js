/**
 * One "common problem" or seasonal page.
 *
 * Written from what the customer notices (a leak, a smell, mould in October)
 * rather than from the service sold, because that is how people search. The
 * shape is fixed so every one of them answers the same questions in the same
 * order: what it is, the signs, the causes, what we do, what it costs, the
 * questions people ask, and where to go next.
 *
 * Price wording comes from content/price-guide.js when the owners have given
 * a range for the related service; until then each page says how the job is
 * priced without inventing a figure.
 */
import { heroCta } from './hero-cta.js';
import { SITES, bookScripts, verifiedBadge } from './area-template.js';
import { shell, orCall } from './page-shell.js';
import { sectionList } from './service-template.js';
import { bookForm } from './book-form.js';
import { priceGuide } from '../content/price-guide.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Where each kind of page lives. */
export const TOPIC_HUBS = {
  problems: { path: '/problems', label: 'Common problems', dir: 'problem-pages' },
  seasonal: { path: '/seasonal', label: 'Seasonal', dir: 'seasonal-pages' }
};

/** Everything on the page written for this problem on this site. */
export function distinctiveWordCount(page) {
  return words([page.intro, ...page.signs, ...page.causes, ...page.whatWeDo, page.price, ...page.faq.map((f) => f.q + ' ' + f.a)].join(' '));
}

const gbp = (n) => '£' + Number(n).toLocaleString('en-GB');

/* A range only when the owners have given one for the related service. */
function priceText(page) {
  const range = page.priceKey && priceGuide[page.site] && priceGuide[page.site][page.priceKey];
  if (!range) return `<p>${page.price}</p>`;
  return `<p>Typically ${gbp(range.from)} to ${gbp(range.to)} for ${esc(range.typical)}.</p>
    <p>${page.price}</p>`;
}

function schema(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

/**
 * @param {object} page content/problems or content/seasonal entry
 * @param {'problems'|'seasonal'} kind
 * @param {{services: object[], guides: object[], areas: object[]}} links what the page may link to
 */
export function render(page, kind, links) {
  const site = SITES[page.site];
  if (!site) throw new Error(`${page.slug}: unknown site "${page.site}"`);
  const hub = TOPIC_HUBS[kind];
  const url = `${site.origin}${hub.path}/${page.slug}`;

  const services = (page.related || []).map((slug) => links.services.find((s) => s.slug === slug && s.site === page.site)).filter(Boolean);
  const guides = (page.guides || []).map((slug) => links.guides.find((g) => g.slug === slug && g.site === page.site)).filter(Boolean);
  const areas = site.areasPath ? links.areas.filter((a) => a.site === page.site) : [];
  const priceLink = links.hasPricing ? ' <a href="/pricing">See our prices</a>.' : '';

  const crumbSchema = schema('BreadcrumbList', {
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: hub.label, item: `${site.origin}${hub.path}` },
      { '@type': 'ListItem', position: 3, name: page.name, item: url }
    ]
  });
  const faqSchema = schema('FAQPage', {
    mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  });
  const businessSchema = schema(site.schemaType, {
    name: site.brand, url: `${site.origin}/`, telephone: site.phone || undefined, email: site.email || undefined,
    areaServed: site.served, description: page.metaDescription
  });

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="${hub.path}">${esc(hub.label)}</a> / ${esc(page.name)}</p>

  <div class="hero">
    <h1>${esc(page.h1)}</h1>
    <p class="lede">${page.intro}</p>
    ${heroCta(page.site)}
  </div>

  <section class="sec">
    <h2>Signs to look for</h2>${sectionList({ list: page.signs })}
  </section>

  <section class="sec">
    <h2>What causes it</h2>
    ${page.causes.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>What we do</h2>
    ${page.whatWeDo.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec price-guide">
    <h2>What it usually costs</h2>
    ${priceText(page)}${priceLink ? `\n    <p>${priceLink.trim()}</p>` : ''}
  </section>

  <section class="sec" id="faq">
    <h2>Questions</h2>
    ${page.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>Related</h2>
    <ul class="chips">
      ${[...services.map((s) => `<li><a href="/services/${s.slug}">${esc(s.name)}</a></li>`),
    ...guides.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.name)}</a></li>`),
    `<li><a href="${hub.path}">${esc(hub.label === 'Seasonal' ? 'More seasonal advice' : 'More common problems')}</a></li>`].join('\n      ')}
    </ul>
${site.areasPath ? `    <h3>Where we work</h3>
    <ul class="chips">
      ${[...areas.slice(0, 8).map((a) => `<li><a href="${site.areasPath}/${a.slug}">${esc(a.name)}</a></li>`),
    `<li><a href="${site.areasPath}">Every area we cover</a></li>`].join('\n      ')}
    </ul>
` : ''}  </section>`;

  const aside = `
    <div class="booking">
      <h2>${esc(page.ctaHeading)}</h2>
      <p>${esc(page.ctaBody)}${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: page.title,
    metaDescription: page.metaDescription,
    schemas: [businessSchema, crumbSchema, faqSchema],
    body,
    aside,
    scripts: bookScripts(site)
  });
}
