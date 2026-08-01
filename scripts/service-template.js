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
import { SITES, bookScripts } from './area-template.js';
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

function brandMark(site) {
  if (!site.logo) return `<span class="abrand"><span>Damp</span><span class="hi">Scan</span></span>`;
  return `<span class="abrand"><img src="${site.logo}" alt="" width="48" height="34" />ATi Damp Survey</span>`;
}

function schema(service, site, url, type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

export function render(service, allServices) {
  const site = SITES[service.site];
  if (!site) throw new Error(`${service.slug}: unknown site "${service.site}"`);
  const url = `${site.origin}/services/${service.slug}`;

  const related = (service.related || [])
    .map((slug) => allServices.find((s) => s.slug === slug && s.site === service.site))
    .filter(Boolean);

  const serviceSchema = schema(service, site, url, 'Service', {
    name: service.name,
    serviceType: service.name,
    description: service.metaDescription,
    url,
    provider: { '@type': site.schemaType, name: site.brand, url: `${site.origin}/`, telephone: site.phone },
    areaServed: { '@type': 'Place', name: site.served }
  });

  const faqSchema = schema(service, site, url, 'FAQPage', {
    mainEntity: service.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  const crumbSchema = schema(service, site, url, 'BreadcrumbList', {
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Services', item: `${site.origin}/#services` },
      { '@type': 'ListItem', position: 3, name: service.name, item: url }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en-GB" data-site="${site.key}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(service.title)}</title>
<meta name="description" content="${esc(service.metaDescription)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(service.title)}" />
<meta property="og:description" content="${esc(service.metaDescription)}" />
<meta property="og:locale" content="en_GB" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/area.css" />
<link rel="stylesheet" href="/assets/book.css" />
<script type="application/ld+json">${serviceSchema}</script>
<script type="application/ld+json">${crumbSchema}</script>
<script type="application/ld+json">${faqSchema}</script>
</head>
<body>

<header class="ahead">
  <div class="wrap">
    <a href="/" aria-label="${esc(site.brand)} home">${brandMark(site)}</a>
    <nav aria-label="Main">
      <a href="/#services">Services</a>
      <a href="/#areas">Areas</a>
      <a href="/#faq">FAQs</a>
      <a href="#book">Book</a>
    </nav>
  </div>
</header>

<main class="wrap">
  <p class="crumb"><a href="/">Home</a> / <a href="/#services">Services</a> / ${esc(service.name)}</p>

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

  <section class="sec" id="book-section">
    <h2>${esc(service.ctaHeading)}</h2>
    <p>${service.ctaBody} Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
    ${bookForm(site.key)}
  </section>

  <section class="sec">
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
` : ''}
</main>

<footer class="afoot">
  <div class="wrap">
    <span>${esc(site.brand)}. ${esc(site.strap)}.</span>
    <span><a href="/">Home</a> &middot; <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a> &middot; <a href="mailto:${site.email}">${esc(site.email)}</a></span>
  </div>
</footer>
${bookScripts(site)}
</body>
</html>
`;
}
