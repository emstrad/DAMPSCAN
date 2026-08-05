/**
 * One service page.
 *
 * The two sites cover the same eight subjects and must not say the same thing
 * about them, because two pages on two domains you own competing for one query
 * means Google picks one and buries the other. They are written from the two
 * businesses' actual positions instead: DampScan diagnoses and then carries out
 * the work under an insured guarantee, ATi surveys only and writes for buyers,
 * solicitors and disrepair. Same subject, two genuinely different documents.
 *
 * The shared page shell and site details come from area-template.js, so the
 * area and service pages stay visually identical without a second copy of it.
 */
import { SITES, bookScripts, verifiedBadge } from './area-template.js';
import { shell } from './page-shell.js';
import { bookForm } from './book-form.js';


const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Everything on the page that is written for this service on this site. */
export function distinctiveWordCount(service) {
  return words([
    service.intro,
    ...service.sections.flatMap((s) => [s.h2, ...s.paras]),
    ...service.signs,
    ...service.faq.map((f) => f.q + ' ' + f.a)
  ].join(' '));
}

function schema(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

export function render(service, allServices) {
  const site = SITES[service.site];
  if (!site) throw new Error(`${service.slug}: unknown site "${service.site}"`);
  const url = `${site.origin}/services/${service.slug}`;

  const related = (service.related || [])
    .map((slug) => allServices.find((s) => s.slug === slug && s.site === service.site))
    .filter(Boolean);

  const serviceSchema = schema('Service', {
    name: service.name,
    serviceType: service.name,
    description: service.metaDescription,
    url,
    provider: { '@type': site.schemaType, name: site.brand, url: `${site.origin}/`, telephone: site.phone },
    areaServed: { '@type': 'Place', name: site.served }
  });

  const faqSchema = schema('FAQPage', {
    mainEntity: service.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  /* Middle rung is /services/, a real page, not an anchor on the home page. */
  const crumbSchema = schema('BreadcrumbList', {
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Services', item: `${site.origin}/services/` },
      { '@type': 'ListItem', position: 3, name: service.name, item: url }
    ]
  });

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="/services/">Services</a> / ${esc(service.name)}</p>

  <div class="hero">
    <h1>${esc(service.h1)}</h1>
    <p class="lede">${service.intro}</p>
  </div>

  <section class="sec">
    <h2>${esc(service.signsHeading)}</h2>
    <ul class="ticks">
      ${service.signs.map((s) => `<li>${s}</li>`).join('\n      ')}
    </ul>
  </section>

  ${service.sections.map((s) => `<section class="sec">
    <h2>${esc(s.h2)}</h2>
    ${s.paras.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>`).join('\n\n  ')}

  <section class="sec" id="faq">
    <h2>Questions</h2>
    ${service.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${related.length ? `
  <section class="sec">
    <h2>Related</h2>
    <ul class="chips">
      ${related.map((r) => `<li><a href="/services/${r.slug}">${esc(r.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
` : ''}`;

  const aside = `
    <div class="booking">
      <h2>${esc(service.ctaHeading)}</h2>
      <p>${service.ctaBody} Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
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
    scripts: bookScripts(site)
  });
}
