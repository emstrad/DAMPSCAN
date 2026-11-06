/**
 * A DampScan town survey page: /damp-survey/<town>.
 *
 * The district pages were written for council districts, and nobody searches
 * for "Tonbridge and Malling". People search for the town they live in, so
 * each town gets its own page, driven by its entry in content/kent-towns/.
 * The local copy is the page; the framing from scripts/town-copy.js is the
 * part every survey shares, in versions picked so that no two towns read
 * alike. test/town-pages.test.js measures how much any two pages share.
 */
import { heroCta } from './hero-cta.js';
import { shell, orCall } from './page-shell.js';
import { SITES } from './sites.js';
import { bookForm } from './book-form.js';
import { bookScripts, verifiedBadge } from './area-template.js';
import { body as reviewText } from './reviews-block.js';
import { reviews } from '../content/reviews/index.js';
import { MIN_REVIEWS } from '../lib/google-reviews.js';
import { SURVEY_COPY, SURVEY_SECTIONS } from './town-copy.js';
import { variantCode, pick } from './variants.js';
import { townTitle, townDescription } from './seo-meta.js';

export const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const words = (text) => String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/** Words on the survey page that are true only of this town. */
export function townWordCount(t) {
  const s = t.survey;
  return words([s.intro, ...s.stock, s.ground, ...s.causes, ...s.areas.map((a) => a.name + ' ' + a.text),
    s.buyers, ...moreWords(s.more), ...s.faq.map((f) => f.q + ' ' + f.a)].join(' '));
}

/** An optional extra local section: { h, paras }. */
export const moreWords = (m) => (m ? [m.h, ...m.paras] : []);

export function moreSection(m) {
  if (!m) return '';
  return `
  <section class="sec">
    <h2>${esc(m.h)}</h2>
    ${m.paras.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>
`;
}

/** Two real reviews, rotated by the page's position so neighbouring pages do
    not open with the same quote. Words exactly as written on Google. */
export function reviewsFor(siteKey, index) {
  const held = reviews[siteKey] || [];
  const list = held.filter((r) => String(r.text || '').trim());
  if (held.length < MIN_REVIEWS || list.length < 2) return '';
  const pickTwo = [list[index % list.length], list[(index + 1) % list.length]];
  return `
  <section class="sec quotes" id="reviews">
    <h2>What customers say on Google</h2>
    ${pickTwo.map((r) => `<blockquote class="quote-card"><p>${reviewText(r.text)}</p><cite>${esc(r.author)}, on Google</cite></blockquote>`).join('\n    ')}
  </section>
`;
}

export function schemaJson(type, extra) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...extra });
}

export function faqSchema(list) {
  return schemaJson('FAQPage', {
    mainEntity: list.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') } }))
  });
}

/** The question every town page answers the same way, in DampScan's words. */
export function surveyBrandFaq(t) {
  return {
    q: `Will you try to sell me damp proofing in ${t.name}?`,
    a: 'No. DampScan is a survey and report practice and carries out no remedial work of any kind. Where work is needed, the report specifies it so any contractor can price it, and where it is not, the report says so.'
  };
}

/** Breadcrumb trail: Home, Areas, the district hub where it is a separate
    page, then the page itself. */
export function trail(site, t, last) {
  const items = [{ name: site.brand, path: '/' }, { name: 'Areas', path: '/damp-survey' }];
  if (t.districtHub) items.push({ name: t.districtHub.name, path: `/damp-survey/${t.districtHub.slug}` });
  if (last) items.push({ name: t.name, path: `/damp-survey/${t.slug}` }, last);
  else items.push({ name: t.name, path: `/damp-survey/${t.slug}` });
  const visible = items.map((it, i) => (i === items.length - 1 ? esc(it.name) : `<a href="${it.path}">${esc(i === 0 ? 'Home' : it.name)}</a>`)).join(' / ');
  const json = schemaJson('BreadcrumbList', {
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: site.origin + it.path }))
  });
  return { visible: `<p class="crumb">${visible}</p>`, json };
}

/** Links to the other towns in the same district, and to nearby towns. */
export function townLinks(t, allTowns) {
  const siblings = allTowns.filter((o) => o.district === t.district && o.slug !== t.slug);
  const near = (t.nearby || []).map((s) => allTowns.find((o) => o.slug === s)).filter(Boolean)
    .filter((o) => !siblings.includes(o));
  const li = (o) => `<li><a href="/damp-survey/${o.slug}">${esc(o.name)}</a></li>`;
  return `
  <section class="sec">
    <h2>Other towns we survey near ${esc(t.name)}</h2>
${siblings.length ? `    <h3>In the same district</h3>
    <ul class="chips">
      ${siblings.map(li).join('\n      ')}
    </ul>
` : ''}${near.length ? `    <h3>Nearby</h3>
    <ul class="chips">
      ${near.map(li).join('\n      ')}
    </ul>
` : ''}    <p><a href="/damp-survey">Every town and district we cover</a></p>
  </section>
`;
}

export function render(t, allTowns) {
  const site = SITES.dampscan;
  const index = allTowns.indexOf(t);
  const code = variantCode(index, 3, SURVEY_SECTIONS, allTowns.length);
  const C = SURVEY_COPY;
  const covers = pick(C.covers, code, 0)(t);
  const report = pick(C.report, code, 1)(t);
  const process = pick(C.process, code, 2)(t);
  const independent = pick(C.independent, code, 3)(t);
  const cta = pick(C.cta, code, 4)(t);
  const tell = pick(C.tellApart, code, 5)(t);
  const landlords = pick(C.landlords, code, 6)(t);
  const s = t.survey;
  const url = `${site.origin}/damp-survey/${t.slug}`;
  const title = townTitle(t);
  const description = townDescription(t);
  const faq = [...s.faq, surveyBrandFaq(t)];
  const crumbs = trail(site, t);

  const body = `
  ${crumbs.visible}

  <div class="hero">
    <h1>${esc(s.h1 || `Damp survey in ${t.name}`)}</h1>
    <p class="lede">${s.intro}</p>
    ${heroCta('dampscan')}
  </div>

  <section class="sec">
    <h2>${esc(t.name)} homes, and how they get damp</h2>
    ${s.stock.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>Ground, water and weather in ${esc(t.name)}</h2>
    <p>${s.ground}</p>
  </section>
${moreSection(s.more)}
  <section class="sec">
    <h2>What we find most often in ${esc(t.name)}</h2>
    <ul class="ticks">
      ${s.causes.map((c) => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>Around ${esc(t.name)}</h2>
    ${s.areas.map((a) => `<h3>${esc(a.name)}</h3>
    <p>${a.text}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>${esc(tell.h)}</h2>
    ${tell.paras.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>${esc(covers.h)}</h2>
    <p>${covers.lead}</p>
    <ul class="ticks">
      ${covers.list.map((c) => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>${esc(report.h)}</h2>
    <p>${report.lead}</p>
    <ul class="ticks">
      ${report.list.map((c) => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>Buying or letting in ${esc(t.name)}</h2>
    <p>${s.buyers}</p>
    <p>${landlords}</p>
  </section>

  <section class="sec">
    <h2>${esc(process.h)}</h2>
    <ol class="steps">
      ${process.steps.map((p) => `<li>${p}</li>`).join('\n      ')}
    </ol>
    <p>${independent}</p>
  </section>
${reviewsFor('dampscan', index)}
  <section class="sec" id="faq">
    <h2>Damp survey questions from ${esc(t.name)}</h2>
    ${faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>Where we cover around ${esc(t.name)}</h2>
    <ul class="chips">
      ${t.places.map((p) => `<li>${esc(p)}</li>`).join('\n      ')}
    </ul>
    <h3>Postcode districts</h3>
    <ul class="chips">
      ${t.postcodes.map((d) => `<li>${esc(d)}</li>`).join('\n      ')}
    </ul>
  </section>
${townLinks(t, allTowns)}
  <section class="sec">
    <h2>Book a damp survey in ${esc(t.name)}</h2>
    <p>${cta}</p>
    <p><a class="btn btn--primary" href="#book">Book a survey</a> or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a></p>
  </section>
`;

  const aside = `
    <div class="booking">
      <h2>Book a survey in ${esc(t.name)}</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit.${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  const service = schemaJson('Service', {
    name: `Damp survey in ${t.name}`,
    serviceType: 'Damp survey',
    url,
    description,
    provider: { '@type': site.schemaType, name: site.brand, url: site.origin + '/', telephone: site.phone, email: site.email || undefined },
    areaServed: [{ '@type': 'City', name: t.name }, ...t.places.filter((p) => p !== t.name).map((name) => ({ '@type': 'Place', name }))]
  });

  return shell({ site, url, title, metaDescription: description, schemas: [service, crumbs.json, faqSchema(faq)], body, aside, scripts: bookScripts(site) });
}
