/**
 * The document around every generated page: area, service and hub.
 *
 * It lived inside area-template.js and was copied into service-template.js,
 * which is how the two drifted. It is here now so a change to the nav, the
 * breadcrumb trail or the head is one edit rather than three.
 *
 * The nav is the part that matters for ranking. It used to point at /#services
 * and /#areas, anchors on the home page, which told a crawler that the
 * sixty-four detail pages hang off nothing. It points at the hub pages now.
 */
import { adsTag } from './ads-tag.js';
import { seasonNavItem, buildMonth } from './season.js';
import { footerAreas } from './footer-areas.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* The same nav the home page carries, so following a link off it does not
   change the furniture. Anchors resolve to the home page except the FAQ, which
   every content page has one of; the hubs do not, so theirs points home. */
function nav(ownFaq, site) {
  return site.nav
    .map((item) => {
      const href = item.href === 'FAQ' ? (ownFaq ? '#faq' : '/#faq') : item.href;
      // `extra` items are menu only: header.css hides them on the full bar.
      return `          <li${item.extra ? ' class="nav-extra"' : ''}><a href="${href}">${esc(item.label)}</a></li>`;
    })
    .join('\n');
}

/**
 * @param {object} page
 * @param {object} page.site entry from SITES
 * @param {string} page.url canonical
 * @param {string[]} page.schemas JSON-LD strings, already stringified
 * @param {string} page.body the left hand column, breadcrumb included
 * @param {string} page.aside the sticky right hand column
 * @param {boolean} [page.ownFaq] whether this page has its own #faq section
 */

/**
 * The three places a phone number appears in the shell, and nothing at all
 * when a brand has not been given one yet.
 *
 * A new business often has a domain and a site before it has a number, and
 * "tel:null" in the header is worse than no call button: it is a dead link on
 * every page, and it tells schema.org the telephone is the string "null".
 * Leaving the number out until it exists is the same rule the enquiry form
 * already follows, and it means a fifth brand is a SITES entry rather than a
 * template change.
 *
 * Each helper carries its own surrounding whitespace, so a brand with a number
 * renders byte for byte as it did when these were written inline.
 */
const CALL_SVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg>`;

/* A WhatsApp chat button, for a brand that has given a number for it. Most
   people with a leaking roof would rather send a photo than fill in a form. */
const WA_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.4-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>';
export function whatsappButton(site) {
  if (!site.whatsapp) return '';
  const text = encodeURIComponent(`Hello ${site.brand}, I'd like a quote. My postcode is `);
  return `<a class="wa-float" href="https://wa.me/${site.whatsapp}?text=${text}" target="_blank" rel="noopener" aria-label="Message ${esc(site.brand)} on WhatsApp">${WA_SVG}</a>
`;
}

function headerCall(site) {
  if (!site.phone) return '';
  return `        <a href="tel:${site.phone}" class="call-link" aria-label="Call ${esc(site.phoneLabel)}">${CALL_SVG(15)}<span class="call-num">${esc(site.phoneLabel)}</span></a>\n`;
}

function barCall(site) {
  if (!site.phone) return '';
  return `  <a href="tel:${site.phone}" class="btn btn--ghost">${CALL_SVG(16)} Call</a>\n`;
}

/** The trailing "Or call ..." on a call to action, or nothing when there is
    no number yet. The leading space is inside the string, so the sentence
    before it is unchanged either way. */
export function orCall(site) {
  if (!site.phone) return '';
  return ` Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.`;
}

function footCall(site) {
  if (!site.phone) return '';
  return ` &middot; <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>`;
}

/* `month` picks the in-season menu item (scripts/season.js). The frames
   api/gallery.js fills pass 0, which leaves the choice to the browser: they
   are generated once and served for months. */
export function shell({ site, url, title, metaDescription, schemas = [], body, aside, scripts, ownFaq = true, styles = [], month = buildMonth() }) {
  return `<!DOCTYPE html>
<html lang="en-GB" class="no-js" data-site="${site.code || site.key}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${adsTag(site.key)}
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(metaDescription)}" />
<meta property="og:locale" content="en_GB" />
<meta property="og:site_name" content="${esc(site.brand)}" />
${site.og ? `<meta property="og:image" content="${site.origin}${site.og}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />` : ''}
<link rel="preload" as="font" type="font/woff2" href="${site.font || '/assets/fonts/plus-jakarta-sans-var.woff2'}" crossorigin />
<link rel="stylesheet" href="/assets/header.css" />
<link rel="stylesheet" href="/assets/area.css" />
<link rel="stylesheet" href="/assets/book.css" />${styles.map((href) => `\n<link rel="stylesheet" href="${href}" />`).join('')}
<style>:root{--head-bg:${site.headBg};--head-solid:${site.headSolid}}</style>
<script>document.documentElement.classList.remove('no-js')</script>
${schemas.map((s) => `<script type="application/ld+json">${s}</script>`).join('\n')}
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header" id="site-header">
  <div class="wrap nav">
    <a href="/" class="brand" aria-label="${esc(site.brand)} home">${site.lockup}</a>
    <div class="nav-end">
      <nav aria-label="Primary">
        <button class="nav-toggle" type="button" aria-expanded="false"
          aria-controls="primary-nav" aria-label="Menu">
          <span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="nav-toggle-text">Menu</span>
        </button>
        <ul class="nav-links" id="primary-nav">
${nav(ownFaq, site)}
${seasonNavItem(site.key, month)}        </ul>
      </nav>
      <div class="nav-cta">
${headerCall(site)}        <a href="#book" class="btn btn--primary">${esc(site.ctaLabel)}</a>
      </div>
    </div>
  </div>
</header>

<main class="wrap page" id="main">
  <div class="page-main">${body}
  </div>

  <aside class="page-aside">${aside}
  </aside>
</main>

<nav class="action-bar" aria-label="Quick actions">
${barCall(site)}  <a href="#book" class="btn btn--primary">${esc(site.barLabel)}</a>
</nav>

${whatsappButton(site)}<footer class="afoot">
  <div class="wrap">
${footerAreas(site.key) ? `  ${footerAreas(site.key)}
` : ''}    <span>${esc(site.brand)}. ${esc(site.strap)}.</span>
    <span><a href="/">Home</a>${(site.footerLinks || []).map((l) => ` &middot; <a href="${l.href}">${esc(l.label)}</a>`).join('')}${(site.socials || []).map((l) => ` &middot; <a href="${l.href}" rel="noopener me" target="_blank">${esc(l.label)}</a>`).join('')}${footCall(site)}${site.locality ? ` &middot; ${esc(site.locality)}` : ''} &middot; ${site.email ? `<a href="mailto:${site.email}">${esc(site.email)}</a>` : '<a href="#book">Send us a message</a>'}</span>
  </div>
</footer>
${scripts}
<script src="/assets/menu.js" defer></script>
<script src="/assets/season.js" defer></script>
</body>
</html>
`;
}
