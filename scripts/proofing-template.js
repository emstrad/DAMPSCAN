/**
 * A "damp proofing in <place>" page: /damp-proofing/<slug>, on either damp
 * site.
 *
 * "damp proofing <town>" is searched far more than "damp survey <town>", and
 * neither brand sells damp proofing. So the page says that plainly and makes
 * itself useful to the person searching: why the cause should be found first,
 * what proper damp proofing looks like for that place's walls, and how to
 * avoid paying for work the wall does not need.
 *
 * `page` is a normalised object built in scripts/proofing-pages.js from a
 * Kent town (DampScan) or a London borough plus its proofing copy (ATi).
 */
import { heroCta } from './hero-cta.js';
import { shell, orCall } from './page-shell.js';
import { SITES } from './sites.js';
import { bookForm } from './book-form.js';
import { bookScripts, verifiedBadge } from './area-template.js';
import { PROOFING_COPY, PROOFING_SECTIONS } from './proofing-copy.js';
import { variantCode, pick } from './variants.js';
import { proofingTitle, proofingDescription } from './seo-meta.js';
import { esc, reviewsFor, schemaJson, faqSchema, moreWords, moreSection } from './town-template.js';

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Words on the page written only for this place. */
export function proofingWordCount(page) {
  const p = page.proofing;
  return words([p.intro, p.oversold, p.walls, ...p.right, ...moreWords(p.more), ...p.faq.map((f) => f.q + ' ' + f.a)].join(' '));
}

const BRAND_FAQ = {
  dampscan: (n) => ({
    q: `Do you carry out damp proofing in ${n}?`,
    a: 'No. We survey and report only, and we take no commission from contractors. That is what lets the report say a wall does not need damp proofing when it does not. Where it does, the specification is written for you to get like for like quotes.'
  }),
  ati: (n) => ({
    q: `Can you recommend a damp proofing company in ${n}?`,
    a: 'We do not refer work or take commission, which keeps the report independent. What we give you instead is a specification precise enough that any competent contractor can price it, and we are happy to read the quotes you receive against it.'
  })
};

export function render(page, index, count) {
  const site = SITES[page.site];
  const copy = PROOFING_COPY[page.site];
  const base = page.site === 'ati' ? 2 : 3;
  const code = variantCode(index, base, PROOFING_SECTIONS, count);
  const why = pick(copy.why, code, 0)(page);
  const proper = pick(copy.proper, code, 1)(page);
  const oversold = pick(copy.oversold, code, 2)(page);
  const dpc = pick(copy.dpc, code, 3)(page);
  const cta = pick(copy.cta, code, 4)(page);
  const types = pick(copy.types, code, 5)(page);
  const after = pick(copy.after, code, 6)(page);
  const cost = pick(copy.cost, code, 7)(page);
  /* ATi only: leases and landlords, the London angle DampScan does not need. */
  const lease = copy.lease ? pick(copy.lease, code, 0)(page) : '';
  const p = page.proofing;
  const url = `${site.origin}/damp-proofing/${page.slug}`;
  const surveyPath = `/damp-survey/${page.slug}`;
  const title = proofingTitle(page);
  const description = proofingDescription(page);
  const faq = [...p.faq, BRAND_FAQ[page.site](page.name)];

  const items = [
    { name: site.brand, path: '/' },
    { name: 'Areas', path: '/damp-survey' },
    { name: page.name, path: surveyPath },
    { name: 'Damp proofing', path: `/damp-proofing/${page.slug}` }
  ];
  const crumb = items.map((it, i) => (i === items.length - 1 ? esc(it.name) : `<a href="${it.path}">${esc(i === 0 ? 'Home' : it.name)}</a>`)).join(' / ');
  const crumbJson = schemaJson('BreadcrumbList', {
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: site.origin + it.path }))
  });

  const near = (page.nearby || []).map((n) => `<li><a href="/damp-proofing/${n.slug}">Damp proofing in ${esc(n.name)}</a></li>`);

  const body = `
  <p class="crumb">${crumb}</p>

  <div class="hero">
    <h1>${esc(page.site === 'ati' ? `Damp proofing in ${page.name}: an independent survey first` : `Damp proofing in ${page.name}? Get an independent survey first`)}</h1>
    <p class="lede">${p.intro}</p>
    ${heroCta(page.site)}
  </div>

  <section class="sec">
    <h2>Why the survey comes before damp proofing in ${esc(page.name)}</h2>
    <p>${why}</p>
    <p>${p.oversold}</p>${lease ? `\n    <p>${lease}</p>` : ''}
  </section>

  <section class="sec">
    <h2>${esc(types.h)}</h2>
    ${types.paras.map((x) => `<p>${x}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>${esc(page.name)} walls, and what they actually need</h2>
    <p>${p.walls}</p>${page.ground ? `\n    <p>${page.ground}</p>` : ''}
    <ul class="ticks">
      ${p.right.map((r) => `<li>${r}</li>`).join('\n      ')}
    </ul>
  </section>

${moreSection(p.more)}
  <section class="sec">
    <h2>${esc(proper.h)}</h2>
    <ul class="ticks">
      ${proper.list.map((r) => `<li>${r}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>${esc(oversold.h)}</h2>
    <ul class="ticks">
      ${oversold.list.map((r) => `<li>${r}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>When a damp proof course is the right answer</h2>
    <p>${dpc}</p>
    <p>${cost}</p>${page.buyers ? `\n    <p>${page.buyers}</p>` : ''}
    <p>${after}</p>
    <p>For the full picture of what a survey here involves, see <a href="${surveyPath}">damp surveys in ${esc(page.name)}</a>.</p>
  </section>
${page.areas && page.areas.length ? `
  <section class="sec">
    <h2>Around ${esc(page.name)}</h2>
    ${page.areas.map((a) => `<h3>${esc(a.name)}</h3>
    <p>${a.text}</p>`).join('\n    ')}
  </section>
` : ''}${reviewsFor(page.site, index + 3)}
  <section class="sec" id="faq">
    <h2>Damp proofing questions in ${esc(page.name)}</h2>
    ${faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>
${near.length ? `
  <section class="sec">
    <h2>Nearby</h2>
    <ul class="chips">
      ${near.join('\n      ')}
    </ul>
  </section>
` : ''}
  <section class="sec">
    <h2>Book a survey before you pay for damp proofing</h2>
    <p>${cta}</p>
    <p><a class="btn btn--primary" href="#book">${esc(site.ctaLabel)}</a> or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a></p>
  </section>
`;

  const aside = `
    <div class="booking">
      <h2>Survey before damp proofing</h2>
      <p>Same day response, and a written report the day after the visit.${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  const service = schemaJson('Service', {
    name: `Independent damp survey before damp proofing in ${page.name}`,
    serviceType: 'Damp survey',
    url,
    description,
    provider: { '@type': site.schemaType, name: site.brand, url: site.origin + '/', telephone: site.phone, email: site.email || undefined },
    areaServed: [{ '@type': page.site === 'ati' ? 'AdministrativeArea' : 'City', name: page.name }]
  });

  return shell({ site, url, title, metaDescription: description, schemas: [service, crumbJson, faqSchema(faq)], body, aside, scripts: bookScripts(site) });
}
