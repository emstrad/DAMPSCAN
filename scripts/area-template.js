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
import { shell } from './page-shell.js';

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

/* The middle rung is /damp-survey/, a real page, rather than an anchor on the
   home page. That is what makes this a hierarchy rather than a flat list. */
function breadcrumbSchema(area, site, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: site.origin + '/' },
      { '@type': 'ListItem', position: 2, name: 'Areas', item: site.origin + '/damp-survey' },
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

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="/damp-survey">Areas</a> / ${esc(area.name)}</p>

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

  <section class="sec" id="faq">
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
` : ''}`;

  const aside = `
    <div class="booking">
      <h2>Book a survey in ${esc(area.name)}</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit. Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: area.title,
    metaDescription: area.metaDescription,
    schemas: [businessSchema(area, site, url), breadcrumbSchema(area, site, url), faqSchema(area)],
    body,
    aside,
    scripts: bookScripts(site)
  });
}

export { SITES, bookScripts, verifiedBadge, shell };
