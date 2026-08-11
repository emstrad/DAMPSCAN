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
const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function brandMark(site) {
  if (!site.logo) {
    return `<span class="abrand"><span>Damp</span><span class="hi">Scan</span></span>`;
  }
  return `<span class="abrand"><img src="${site.logo}" alt="" width="48" height="34" />${esc(site.brand)}</span>`;
}

/* Every page carries its own FAQ section, so the nav link is a jump down this
   page rather than a trip to the home page's. The hub pages have no FAQ, so
   they get the link to the home page's instead of a dead anchor. */
function nav(ownFaq) {
  return `      <a href="/services">Services</a>
      <a href="/damp-survey">Areas</a>
      <a href="${ownFaq ? '#faq' : '/#faq'}">FAQs</a>
      <a href="#book">Book</a>`;
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
export function shell({ site, url, title, metaDescription, schemas = [], body, aside, scripts, ownFaq = true }) {
  return `<!DOCTYPE html>
<html lang="en-GB" data-site="${site.key}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(metaDescription)}" />
<meta property="og:locale" content="en_GB" />
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/plus-jakarta-sans-var.woff2" crossorigin />
<link rel="stylesheet" href="/assets/area.css" />
<link rel="stylesheet" href="/assets/book.css" />
${schemas.map((s) => `<script type="application/ld+json">${s}</script>`).join('\n')}
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<header class="ahead">
  <div class="wrap">
    <a href="/" aria-label="${esc(site.brand)} home">${brandMark(site)}</a>
    <nav aria-label="Main">
${nav(ownFaq)}
    </nav>
  </div>
</header>

<main class="wrap page" id="main">
  <div class="page-main">${body}
  </div>

  <aside class="page-aside">${aside}
  </aside>
</main>

<nav class="action-bar" aria-label="Quick actions">
  <a href="tel:${site.phone}" class="btn btn--ghost"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg> Call</a>
  <a href="#book" class="btn btn--primary">Book a survey</a>
</nav>

<footer class="afoot">
  <div class="wrap">
    <span>${esc(site.brand)}. ${esc(site.strap)}.</span>
    <span><a href="/">Home</a> &middot; <a href="/services">Services</a> &middot; <a href="/damp-survey">Areas</a> &middot; <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a> &middot; <a href="mailto:${site.email}">${esc(site.email)}</a></span>
  </div>
</footer>
${scripts}
</body>
</html>
`;
}
