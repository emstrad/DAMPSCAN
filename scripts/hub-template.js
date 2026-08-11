/**
 * The services and areas hub pages.
 *
 * These exist so the nav and the breadcrumbs can point at a real page instead
 * of an anchor on the home page. An anchor tells a crawler that the sixty-four
 * detail pages hang off nothing, which is most of why they were not being
 * crawled. A hub gives them a parent.
 *
 * Same shell as the area and service pages, from area-template.js.
 */
import { SITES, bookScripts, verifiedBadge, shell } from './area-template.js';
import { bookForm } from './book-form.js';
import { hubs } from '../content/hubs.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Where each hub lives, and what the pages under it are called. */
export const HUBS = {
  services: { path: '/services', label: 'Services', child: '/services/' },
  areas: { path: '/damp-survey', label: 'Areas', child: '/damp-survey/' }
};

function itemSchema(entries, site, kind) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.name,
      url: `${SITES[site].origin}${HUBS[kind].child}${e.slug}`
    }))
  });
}

function crumbSchema(site, kind, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITES[site].brand, item: `${SITES[site].origin}/` },
      { '@type': 'ListItem', position: 2, name: HUBS[kind].label, item: url }
    ]
  });
}

/**
 * @param {'services'|'areas'} kind
 * @param {string} siteKey
 * @param {Array<{slug:string,name:string,metaDescription:string}>} entries
 */
export function render(kind, siteKey, entries) {
  const site = SITES[siteKey];
  const copy = hubs[siteKey][kind];
  const url = `${site.origin}${HUBS[kind].path}`;

  const list = entries
    .map((e) => `      <li>
        <a href="${HUBS[kind].child}${e.slug}">${esc(e.name)}</a>
        <span>${esc(e.metaDescription)}</span>
      </li>`)
    .join('\n');

  const body = `
  <p class="crumb"><a href="/">Home</a> / ${esc(HUBS[kind].label)}</p>

  <div class="hero">
    <h1>${esc(copy.h1)}</h1>
    <p class="lede">${copy.intro}</p>
  </div>

  <section class="sec">
    ${copy.body.map((p) => `<p>${p}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>${kind === 'services' ? 'Every service, in detail' : 'Every area, in detail'}</h2>
    <ul class="hub-list">
${list}
    </ul>
  </section>`;

  const aside = `
    <div class="booking">
      <h2>${kind === 'services' ? 'Book a survey' : 'Book a survey'}</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit. Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: copy.title,
    metaDescription: copy.metaDescription,
    schemas: [crumbSchema(siteKey, kind, url), itemSchema(entries, siteKey, kind)],
    ownFaq: false,
    body,
    aside,
    scripts: bookScripts(site)
  });
}
