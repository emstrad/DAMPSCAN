import { orCall } from './page-shell.js';
/**
 * The ATi pricing page.
 *
 * Same shell as every other generated page. The only new markup is the band
 * cards, and the ordering is deliberate: what decides the price, then how to
 * tell which band you are, then the bands, then what every one of them
 * includes. The number on its own means nothing until the reader knows what it
 * buys, which is the whole complaint people have about damp survey pricing.
 */
import { SITES, bookScripts, verifiedBadge, shell } from './area-template.js';
import { bookForm } from './book-form.js';
import { pricing as pricing_ } from '../content/pricing.js';
import { EXTRAS, pounds } from '../content/prices.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Offer rather than AggregateOffer, one per band, because these are distinct
   services at distinct prices rather than variants of one thing. Only the two
   genuinely fixed prices carry a price; the two that start "from" carry a
   minimum, because claiming a fixed price we do not offer would be a lie in
   structured data as much as in the copy. */
function offerSchema(site, url, pricing) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Independent damp survey',
    serviceType: 'Damp survey',
    url,
    provider: { '@type': site.schemaType, name: site.brand, url: `${site.origin}/`, telephone: site.phone || undefined },
    areaServed: { '@type': 'Place', name: site.served },
    offers: pricing.bands.map((b) => {
      const amount = b.price.replace(/[^0-9]/g, '');
      return {
        '@type': 'Offer',
        name: b.name,
        description: b.scope,
        priceCurrency: 'GBP',
        ...(b.fixed
          ? { price: amount }
          : { priceSpecification: { '@type': 'PriceSpecification', minPrice: amount, priceCurrency: 'GBP' } })
      };
    })
  });
}

function crumbSchema(site, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: site.brand, item: `${site.origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Prices', item: url }
    ]
  });
}

function faqSchema(pricing) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pricing.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });
}

export function render(siteKey) {
  const pricing = pricing_[siteKey];
  if (!pricing) throw new Error(`no pricing content for site "${siteKey}"`);
  const site = SITES[pricing.site];
  const url = `${site.origin}/pricing`;

  const body = `
  <p class="crumb"><a href="/">Home</a> / Prices</p>

  <div class="hero">
    <h1>${esc(pricing.h1)}</h1>
    <p class="lede">${esc(pricing.intro)}</p>
  </div>

  <p class="price-note"><strong>${esc(pricing.priceLead)}</strong> ${esc(pricing.fixedFee)}</p>

  <section class="sec" id="prices">
    <h2>Prices</h2>
    <div class="extras-wrap"><table class="extras price-table">
      <thead><tr><th scope="col">Size of home</th><th scope="col">Damp survey</th><th scope="col">Damp and timber</th></tr></thead>
      <tbody>
${pricing.bands.map((b) => `        <tr><th scope="row">${esc(b.scope)}</th><td>${esc(b.price)}</td><td>${esc(b.timber)}</td></tr>`).join('\n')}
      </tbody>
    </table></div>

    <h3 class="extras-h">Extra checks</h3>
    <div class="extras-wrap"><table class="extras">
      <thead><tr><th scope="col">Check</th><th scope="col">With a survey</th><th scope="col">On its own</th></tr></thead>
      <tbody>
${EXTRAS.map((x) => `        <tr><th scope="row">${esc(x.name)}<small>${esc(x.scope)}</small></th><td>${esc(pounds(x.withSurvey, x.from))}</td><td>${esc(pounds(x.alone, x.from))}</td></tr>`).join('\n')}
      </tbody>
    </table></div>
    <p class="band-foot">Not sure which you need? Book and tell us what you are
      seeing: we recommend the right one and confirm the fee before we come.</p>
  </section>

  <section class="sec more">
    <details class="qa"><summary>Which size is my property?</summary>
${pricing.bands.map((b) => `      <h3>${esc(b.name)}: ${esc(b.price)}</h3>
      <p>${esc(b.best)} ${esc(b.note)}</p>`).join('\n')}
    </details>
    <details class="qa"><summary>What the extra checks are</summary>
${EXTRAS.map((x) => `      <h3>${esc(x.name)}</h3>
      <p>${esc(x.info)}</p>`).join('\n')}
      <p>${esc(pricing.invasiveLine)}</p>
    </details>
    <details class="qa"><summary>What every survey includes</summary>
      <ul class="ticks">
        ${pricing.included.map((i) => `<li>${esc(i)}</li>`).join('\n        ')}
      </ul>
    </details>
    <details class="qa"><summary>What is never added to the bill</summary>
      ${pricing.notIncluded.map((n) => `<h3>${esc(n.h)}</h3>\n      <p>${esc(n.p)}</p>`).join('\n      ')}
    </details>
  </section>

  <section class="sec" id="faq">
    <h2>Questions about the price</h2>
    ${pricing.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>`;

  const aside = `
    <div class="booking">
      <h2>Book a survey</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit.${orCall(site)}</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: pricing.title,
    metaDescription: pricing.metaDescription,
    schemas: [offerSchema(site, url, pricing), crumbSchema(site, url), faqSchema(pricing)],
    body,
    aside,
    scripts: bookScripts(site)
  });
}
