/**
 * One guide page.
 *
 * A guide answers the question people ask before "book a survey": what the
 * treatment costs, whether they need it, what a quote should say. It carries
 * Article structured data with a real publication date, which the area and
 * service pages do not, because a guide is an article and a service page is
 * not.
 *
 * As with the service pages, a subject both sites cover is two documents
 * written from the two firms' positions, never one shared between them. The
 * template is shared; the words are not.
 */
import { SITES, bookScripts, verifiedBadge } from './area-template.js';
import { shell, orCall } from './page-shell.js';
import { bookForm } from './book-form.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Everything on the page written for this guide on this site. */
export function distinctiveWordCount(guide) {
  return words([
    guide.intro,
    ...guide.sections.flatMap((s) => [s.h2, ...s.paras]),
    ...guide.faq.map((f) => f.q + ' ' + f.a)
  ].join(' '));
}

function schema(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

/**
 * @param {object} guide
 * @param {object[]} allGuides every guide, for the "more reading" links
 * @param {object[]} allServices every service, for the related links
 */
export function render(guide, allGuides, allServices) {
  const site = SITES[guide.site];
  if (!site) throw new Error(`${guide.slug}: unknown site "${guide.site}"`);
  const url = `${site.origin}/guides/${guide.slug}`;

  const related = (guide.related || [])
    .map((slug) => allServices.find((s) => s.slug === slug && s.site === guide.site))
    .filter(Boolean);
  const more = allGuides.filter((g) => g.site === guide.site && g.slug !== guide.slug);

  const articleSchema = schema('Article', {
    headline: guide.h1,
    description: guide.metaDescription,
    datePublished: guide.published,
    dateModified: guide.updated || guide.published,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: site.brand, url: `${site.origin}/` },
    publisher: { '@type': 'Organization', name: site.brand, url: `${site.origin}/` },
    image: `${site.origin}${site.og}`
  });

  const faqSchema = schema('FAQPage', {
    mainEntity: guide.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  /* Middle rung is /guides, a real page, not an anchor on the home page. */
  const crumbSchema = schema('BreadcrumbList', {
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${site.origin}/guides` },
      { '@type': 'ListItem', position: 3, name: guide.name, item: url }
    ]
  });

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="/guides">Guides</a> / ${esc(guide.name)}</p>

  <div class="hero">
    <h1>${esc(guide.h1)}</h1>
    <p class="lede">${guide.intro}</p>
  </div>

  ${guide.sections.map((s) => `<section class="sec">
    <h2>${esc(s.h2)}</h2>
    ${s.paras.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>`).join('\n\n  ')}

  <section class="sec" id="faq">
    <h2>Questions</h2>
    ${guide.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${related.length || more.length ? `
  <section class="sec">
    <h2>Related</h2>
    <ul class="chips">
      ${related.map((r) => `<li><a href="/services/${r.slug}">${esc(r.name)}</a></li>`).join('\n      ')}
      ${more.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
` : ''}`;

  const aside = `
    <div class="booking">
      <h2>${esc(guide.ctaHeading || 'Get the answer before you spend')}</h2>
      <p>${guide.ctaBody || 'A survey establishes what is there and what, if anything, needs doing, with a written report within 24 hours of the visit.'}${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: guide.title,
    metaDescription: guide.metaDescription,
    schemas: [articleSchema, crumbSchema, faqSchema],
    body,
    aside,
    scripts: bookScripts(site)
  });
}
