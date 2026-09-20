/**
 * One brand's home page.
 *
 * The two damp home pages are hand written and stay that way: they carry a
 * great deal of bespoke layout and there is no reason to put them through a
 * generator now. A brand arriving into this project has no such page, and
 * hand writing one per brand is how four brands end up with four different
 * ideas of what a home page is.
 *
 * So this renders one from content, through the same shell as every other
 * generated page, and a fifth brand gets a home page by writing
 * content/home/<site>.js and nothing else.
 *
 * Every section is optional except the hero. A trade with no regional coverage
 * to describe, or no process worth four steps, leaves the field out and the
 * section does not appear, rather than appearing empty.
 */
import { SITES, bookScripts, verifiedBadge } from './area-template.js';
import { shell } from './page-shell.js';
import { bookForm } from './book-form.js';
import { reviewsBlock } from './reviews-block.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Everything written for this home page, for the thin page check. */
export function distinctiveWordCount(home) {
  return words([
    home.lede,
    ...(home.highlights || []).flatMap((h) => [h.h3, h.body]),
    home.process ? [home.process.h2, home.process.intro].join(' ') : '',
    ...((home.process && home.process.steps) || []).flatMap((s) => [s.h3, s.body]),
    home.servicesSection ? [home.servicesSection.h2, home.servicesSection.intro].join(' ') : '',
    home.coverage ? [home.coverage.h2, home.coverage.intro].join(' ') : '',
    ...(home.faq || []).map((f) => f.q + ' ' + f.a)
  ].join(' '));
}

function schema(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

function highlights(home) {
  if (!home.highlights || !home.highlights.length) return '';
  return `
  <section class="sec">
    <h2>${esc(home.highlightsHeading)}</h2>
    <div class="cards">
      ${home.highlights.map((h) => `<div class="card">
        <h3>${esc(h.h3)}</h3>
        <p>${h.body}</p>
      </div>`).join('\n      ')}
    </div>
  </section>
`;
}

function process(home) {
  if (!home.process) return '';
  return `
  <section class="sec">
    <h2>${esc(home.process.h2)}</h2>
    <p>${home.process.intro}</p>
    <ol class="steps">
      ${home.process.steps.map((s) => `<li>
        <h3>${esc(s.h3)}</h3>
        <p>${s.body}</p>
      </li>`).join('\n      ')}
    </ol>
  </section>
`;
}

/* The grid is built from the services the brand actually has, so a service
   added to content/ appears here without anybody remembering to link it. A
   page nothing links to is one Google treats as unimportant. */
function serviceGrid(home, services) {
  if (!home.servicesSection) return '';
  const mine = services.filter((s) => s.site === home.site);
  if (!mine.length) return '';
  return `
  <section class="sec">
    <h2>${esc(home.servicesSection.h2)}</h2>
    <p>${home.servicesSection.intro}</p>
    <ul class="chips">
      ${mine.map((s) => `<li><a href="/services/${s.slug}">${esc(s.name)}</a></li>`).join('\n      ')}
    </ul>
  </section>
`;
}

function coverage(home) {
  if (!home.coverage) return '';
  return `
  <section class="sec">
    <h2>${esc(home.coverage.h2)}</h2>
    <p>${home.coverage.intro}</p>
    <div class="cards">
      ${home.coverage.regions.map((r) => `<div class="card">
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.places.join(', '))}</p>
      </div>`).join('\n      ')}
    </div>
  </section>
`;
}

/* The reviews carousel, which ships hidden until the brand has five. The
   section and its id exist either way, because the nav points at #reviews and
   an anchor that resolves to nothing is a link that does nothing. */
function reviewsSection(home) {
  return `
  <section class="sec" id="reviews">
    <h2>${esc(home.reviewsHeading || 'What customers say')}</h2>
    ${reviewsBlock(home.site)}
  </section>
`;
}

function faqBlock(home) {
  if (!home.faq || !home.faq.length) return '';
  return `
  <section class="sec" id="faq">
    <h2>${esc(home.faqHeading || 'Questions')}</h2>
    ${home.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
`;
}

export function render(home, services) {
  const site = SITES[home.site];
  if (!site) throw new Error(`home page: unknown site "${home.site}"`);
  const url = `${site.origin}/`;

  const business = schema(site.schemaType, {
    name: site.brand,
    url,
    email: site.email,
    telephone: site.phone || undefined,
    areaServed: { '@type': 'Place', name: site.served },
    sameAs: site.profileUrl ? [site.profileUrl] : undefined
  });

  const faqSchema = home.faq && home.faq.length
    ? schema('FAQPage', {
      mainEntity: home.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    })
    : null;

  const body = `
  <div class="hero">
    <h1>${esc(home.h1)}</h1>
    <p class="lede">${home.lede}</p>
  </div>
${highlights(home)}${process(home)}${serviceGrid(home, services)}${coverage(home)}${reviewsSection(home)}${faqBlock(home)}`;

  const aside = `
    <div class="booking">
      <h2>${esc(home.ctaHeading)}</h2>
      <p>${home.ctaBody}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: home.title,
    metaDescription: home.metaDescription,
    schemas: [business, faqSchema].filter(Boolean),
    body,
    aside,
    scripts: bookScripts(site),
    /* The questions are on this page, so the shell must not add a link to a
       FAQ that lives somewhere else. */
    ownFaq: true
  });
}
