/**
 * One area page, as a string.
 *
 * The point of an area page is the part that is only true of that place: its
 * housing stock and what that stock does when it gets wet. The shared framing
 * around it is thin on purpose. Thirty pages with a town name swapped into the
 * same paragraph is the doorway page pattern, and Google demotes it, so the
 * generator refuses to build a page whose distinctive copy is too short.
 */
import { heroCta } from './hero-cta.js';
import { body as reviewText } from './reviews-block.js';
import { bookForm } from './book-form.js';
import { shell, orCall } from './page-shell.js';
import { SITES } from './sites.js';
import { areaTitle, areaDescription } from './seo-meta.js';
import { reviews } from '../content/reviews/index.js';
import { MIN_REVIEWS } from '../lib/google-reviews.js';
import { boroughFraming, districtTowns } from './area-sections.js';
import { towns } from '../content/kent-towns.js';

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
  subjectPrefix: '${b.subjectPrefix}',${b.subjectComplete ? `\n  subjectComplete: '${b.subjectComplete}',` : ''}${b.subjectPartial ? `\n  subjectPartial: '${b.subjectPartial}',` : ''}
  dataLayerEvent: '${b.dataLayerEvent}'
};
</scr` + `ipt>
<scr` + `ipt src="/assets/visit.js"></scr` + `ipt>
<scr` + `ipt src="/assets/partial.js"></scr` + `ipt>
<scr` + `ipt src="/assets/book.js"></scr` + `ipt>
<scr` + `ipt src="/assets/address.js" defer></scr` + `ipt>
<scr` + `ipt src="/assets/upload.js" defer></scr` + `ipt>`;
}

/* SurveyMate serves the badge live from its own endpoint, so it reflects the
   firm's current status rather than a copy that would keep saying verified if
   the listing ever lapsed. Fixed dimensions and lazy loading keep it off the
   critical path and stop it shifting the layout when it arrives. */
/* SurveyMate lists damp surveyors, so a brand in another trade has no entry
   and gets no badge. Rendered unconditionally it linked every roofing page to
   /find-a-surveyor/null and pulled a broken image from the same. */
function verifiedBadge(site) {
  const slug = site.surveyMateSlug;
  if (!slug) return '';
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
  return words([
    area.intro, ...area.stock, ...area.common,
    ...(area.towns || []).map((t) => t.name + ' ' + t.text),
    ...area.faq.map((f) => f.q + ' ' + f.a)
  ].join(' '));
}

/* One question every town page answers the same way, because the honest answer
   is the same everywhere: what happens about treatment after the survey. It is
   what "damp proofing <town>" searchers want to know, and it is the one place
   the two brands differ most, so each gets its own. Added to the town's own
   questions rather than replacing any. */
const BRAND_FAQ = {
  dampscan: (n) => ({
    q: `Do you carry out damp proofing in ${n}?`,
    a: 'No. DampScan is an independent survey practice and carries out no remedial work. The report is written so that any competent contractor could price from it, and a survey concluding that no damp proofing is needed is a routine outcome, because nothing rides on the answer for us.'
  }),
  ati: (n) => ({
    q: `Will you try to sell me damp proofing in ${n}?`,
    a: 'No. We carry out no remedial work, so there is nothing to sell after the survey. The report states the cause, the work that would actually fix it and an outline of what that work should reasonably cost, so you can get like for like quotes from contractors of your choice, or put it to a seller, landlord or freeholder.'
  })
};

export function faqFor(area) {
  const extra = BRAND_FAQ[area.site];
  return extra ? [...area.faq, extra(area.name)] : area.faq;
}

function faqSchema(area) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqFor(area).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });
}

/* A Service with the business as provider, rather than a second copy of the
   LocalBusiness on every town page: the business is described once, on the
   home page, and each town page says what is offered where. No rating here:
   Google does not show stars for a business's reviews of itself, and repeating
   an aggregate on every page invites a manual action for nothing. */
function serviceSchema(area, site, url, description) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Damp survey in ${area.name}`,
    serviceType: 'Damp survey',
    url,
    description,
    provider: {
      '@type': site.schemaType,
      name: site.brand,
      url: site.origin + '/',
      telephone: site.phone || undefined,
      email: site.email || undefined
    },
    areaServed: [{ '@type': 'AdministrativeArea', name: area.name },
      ...area.places.filter((p) => p !== area.name).map((name) => ({ '@type': 'Place', name }))]
  });
}

/* Two real reviews, words exactly as written. Which two rotates with the
   page's place in the list, so thirty town pages do not all open the same
   quote: the reviews are about the firm, not the town, and we do not pretend
   otherwise by captioning them with a place. */
function reviewsSection(area, allAreas) {
  const held = reviews[area.site] || [];
  const list = held.filter((r) => String(r.text || '').trim());
  if (held.length < MIN_REVIEWS || list.length < 2) return '';
  const i = Math.max(0, allAreas.filter((a) => a.site === area.site).indexOf(area));
  const pick = [list[i % list.length], list[(i + 1) % list.length]];
  return `
  <section class="sec quotes" id="reviews">
    <h2>What customers say about us</h2>
    ${pick.map((r) => `<blockquote class="quote-card"><p>${reviewText(r.text)}</p><cite>${esc(r.author)}, on Google</cite></blockquote>`).join('\n    ')}
  </section>
`;
}

/* The closing call to action, in the body as well as the aside, because on a
   phone the aside sits below everything and a reader who has just finished
   the questions should not have to scroll back up for a number. */
function ctaSection(area, site) {
  const call = site.phone
    ? ` or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>`
    : '';
  const what = area.site === 'ati'
    ? 'We survey and report only, with no treatment to sell, so what the report says is the whole of our interest.'
    : 'An independent surveyor finds the cause, and we sell no treatment, so the report is the whole of what you pay for.';
  return `
  <section class="sec">
    <h2>Book a damp survey in ${esc(area.name)}</h2>
    <p>${what} Same day response to every enquiry, and a written report with photographs the day after the visit.</p>
    <p><a class="btn btn--primary" href="#book">Book a survey</a>${call}</p>
  </section>
`;
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
  const title = areaTitle(area);
  const description = areaDescription(area);

  const nearby = (area.nearby || [])
    .map((slug) => allAreas.find((a) => a.slug === slug && a.site === area.site)
      || (area.site === 'dampscan' && towns.find((t) => t.slug === slug)))
    .filter(Boolean);

  const body = `
  <p class="crumb"><a href="/">Home</a> / <a href="/damp-survey">Areas</a> / ${esc(area.name)}</p>

  <div class="hero">
    <h1>${esc(area.h1)}</h1>
    <p class="lede">${area.intro}</p>
    ${heroCta(area.site)}
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

${boroughFraming(area, allAreas)}${districtTowns(area)}${area.towns && area.towns.length ? `
  <section class="sec">
    <h2>By town</h2>
    ${area.towns.map((t) => `<h3>${esc(t.name)}</h3>
    <p>${t.text}</p>`).join('\n    ')}
  </section>
` : ''}
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

${reviewsSection(area, allAreas)}
  <section class="sec" id="faq">
    <h2>${esc(area.name)} questions</h2>
    ${faqFor(area).map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${nearby.length ? `
  <section class="sec">
    <h2>Nearby</h2>
    <ul class="chips">
      ${nearby.map((n) => `<li><a href="/damp-survey/${n.slug}">${esc(n.name)}</a></li>`).join('\n      ')}
    </ul>
    <p><a href="/damp-survey">Every area we cover</a></p>
  </section>
` : ''}${ctaSection(area, site)}`;

  const aside = `
    <div class="booking">
      <h2>Book a survey in ${esc(area.name)}</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit.${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title,
    metaDescription: description,
    schemas: [serviceSchema(area, site, url, description), breadcrumbSchema(area, site, url), faqSchema(area)],
    body,
    aside,
    scripts: bookScripts(site)
  });
}

export { SITES, bookScripts, verifiedBadge, shell };
