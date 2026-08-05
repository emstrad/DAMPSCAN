/**
 * One area page, as a string.
 *
 * The point of an area page is the part that is only true of that place: its
 * housing stock and what that stock does when it gets wet. The shared framing
 * around it is thin on purpose. Thirty pages with a town name swapped into the
 * same paragraph is the doorway page pattern, and Google demotes it, so the
 * generator refuses to build a page whose distinctive copy is too short.
 */
import { bookForm } from './book-form.js';

const SITES = {
  dampscan: {
    key: 'dampscan',
    brand: 'DampScan',
    origin: 'https://dampscan.co.uk',
    logo: null,
    phone: '+447386225526',
    phoneLabel: '07386 225526',
    email: 'tom@atidampsurvey.co.uk',
    schemaType: 'LocalBusiness',
    served: 'Kent and the South East of England',
    strap: 'Damp, mould and timber surveys across Kent and the South East',
    surveyMateSlug: 'dampscan',
    // Set to the Business Profile share link to credit Google where the
    // reviews came from. Empty means the credit shows without a link.
    profileUrl: '',
    book: {
      sessionKey: 'dampscan-session',
      attrKey: 'dampscan-attr',
      notify: 'https://formsubmit.co/ajax/tom@atidampsurvey.co.uk',
      subjectPrefix: '',
      dataLayerEvent: 'dampscan'
    }
  },
  ati: {
    key: 'ati',
    brand: 'ATi Damp Survey',
    origin: 'https://atidampsurvey.co.uk',
    logo: '/assets/ati-mark.png',
    phone: '+442033554944',
    phoneLabel: '020 3355 4944',
    email: 'team@atidampsurvey.co.uk',
    schemaType: 'ProfessionalService',
    served: 'London',
    strap: 'Independent damp and timber surveys, no remedial work',
    surveyMateSlug: 'ati-damp-survey',
    profileUrl: '',
    book: {
      sessionKey: 'ati-damp-session',
      attrKey: 'ati-damp-attr',
      notify: 'https://formsubmit.co/ajax/team@atidampsurvey.co.uk',
      subjectPrefix: 'ATI London, ',
      dataLayerEvent: 'ati-damp'
    }
  }
};


/* The booking form needs the same per site values the home pages set inline.
   A static page cannot read environment variables, so they live in SITES.
   The closing script tags are split so this file cannot terminate the script
   block of the page it is generating. */
function bookScripts(site) {
  const b = site.book;
  return `
<script>
window.DS_CONFIG = {
  sessionKey: '${b.sessionKey}',
  attrKey: '${b.attrKey}',
  notify: '${b.notify}',
  subjectPrefix: '${b.subjectPrefix}',
  dataLayerEvent: '${b.dataLayerEvent}'
};
</scr` + `ipt>
<scr` + `ipt src="/assets/visit.js"></scr` + `ipt>
<scr` + `ipt src="/assets/book.js"></scr` + `ipt>`;
}

/* SurveyMate serves the badge live from its own endpoint, so it reflects the
   firm's current status rather than a copy that would keep saying verified if
   the listing ever lapsed. Fixed dimensions and lazy loading keep it off the
   critical path and stop it shifting the layout when it arrives. */
function verifiedBadge(site) {
  const slug = site.surveyMateSlug;
  return `<a class="smate-badge" href="https://survey-mate.co.uk/find-a-surveyor/${slug}"
      rel="noopener" target="_blank">
      <img src="https://survey-mate.co.uk/api/verified-badge/${slug}"
           alt="SurveyMate Verified Firm" width="200" height="64" loading="lazy" decoding="async" />
    </a>`;
}

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Strip the tags an area file is allowed to use, to count real words. */
const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Everything on the page that is true only of this area. */
export function distinctiveWordCount(area) {
  return words([area.intro, ...area.stock, ...area.common, ...area.faq.map((f) => f.q + ' ' + f.a)].join(' '));
}

function brandMark(site) {
  if (!site.logo) {
    return `<span class="abrand"><span>Damp</span><span class="hi">Scan</span></span>`;
  }
  return `<span class="abrand"><img src="${site.logo}" alt="" width="48" height="34" />ATi Damp Survey</span>`;
}

function faqSchema(area) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: area.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });
}

function businessSchema(area, site, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': site.schemaType,
    name: site.brand,
    url,
    telephone: site.phone,
    email: site.email,
    areaServed: { '@type': 'Place', name: area.name },
    description: area.metaDescription
  });
}

function breadcrumbSchema(area, site, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: site.origin + '/' },
      { '@type': 'ListItem', position: 2, name: 'Areas', item: site.origin + '/#areas' },
      { '@type': 'ListItem', position: 3, name: area.name, item: url }
    ]
  });
}

export function render(area, allAreas) {
  const site = SITES[area.site];
  if (!site) throw new Error(`${area.slug}: unknown site "${area.site}"`);
  const url = `${site.origin}/damp-survey/${area.slug}`;

  const nearby = (area.nearby || [])
    .map((slug) => allAreas.find((a) => a.slug === slug && a.site === area.site))
    .filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en-GB" data-site="${site.key}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(area.title)}</title>
<meta name="description" content="${esc(area.metaDescription)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(area.title)}" />
<meta property="og:description" content="${esc(area.metaDescription)}" />
<meta property="og:locale" content="en_GB" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/area.css" />
<link rel="stylesheet" href="/assets/book.css" />
<script type="application/ld+json">${businessSchema(area, site, url)}</script>
<script type="application/ld+json">${breadcrumbSchema(area, site, url)}</script>
<script type="application/ld+json">${faqSchema(area)}</script>
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

<main class="wrap page">
  <div class="page-main">
  <p class="crumb"><a href="/">Home</a> / <a href="/#areas">Areas</a> / ${esc(area.name)}</p>

  <div class="hero">
    <h1>${esc(area.h1)}</h1>
    <p class="lede">${area.intro}</p>
  </div>

  <section class="sec">
    <h2>${esc(area.name)} housing, and what it does when it gets wet</h2>
    ${area.stock.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>What we are usually called out to in ${esc(area.name)}</h2>
    <ul class="ticks">
      ${area.common.map((c) => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>Where we cover</h2>
    <p>${esc(area.coverage)}</p>
    <ul class="chips">
      ${area.places.map((p) => `<li>${esc(p)}</li>`).join('\n      ')}
    </ul>
    <h3>Postcode districts</h3>
    <ul class="chips">
      ${area.districts.map((d) => `<li>${esc(d)}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>${esc(area.name)} questions</h2>
    ${area.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${nearby.length ? `
  <section class="sec">
    <h2>Nearby</h2>
    <ul class="chips">
      ${nearby.map((n) => `<li><a href="/damp-survey/${n.slug}">${esc(n.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
` : ''}
  </div>

  <aside class="page-aside">
    <div class="booking">
      <h2>Book a survey in ${esc(area.name)}</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit. Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>
  </aside>
</main>

<div class="action-bar" role="group" aria-label="Quick actions">
  <a href="tel:${site.phone}" class="btn btn--ghost"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg> Call</a>
  <a href="#book" class="btn btn--primary">Book a survey</a>
</div>

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

export { SITES, bookScripts, verifiedBadge };
