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
import { pricing } from '../content/pricing.js';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Offer rather than AggregateOffer, one per band, because these are distinct
   services at distinct prices rather than variants of one thing. Only the two
   genuinely fixed prices carry a price; the two that start "from" carry a
   minimum, because claiming a fixed price we do not offer would be a lie in
   structured data as much as in the copy. */
function offerSchema(site, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Independent damp survey',
    serviceType: 'Damp survey',
    url,
    provider: { '@type': site.schemaType, name: site.brand, url: `${site.origin}/`, telephone: site.phone },
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

function faqSchema() {
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

function band(b) {
  return `      <article class="band${b.fixed ? ' band--fixed' : ''}">
        <h3>${esc(b.name)}</h3>
        <p class="band-price">${esc(b.price)}</p>
        <p class="band-scope">${esc(b.scope)}</p>
        <p class="band-best">${esc(b.best)}</p>
        <p class="band-note">${esc(b.note)}</p>
      </article>`;
}

export function render() {
  const site = SITES[pricing.site];
  const url = `${site.origin}/pricing`;

  const body = `
  <p class="crumb"><a href="/">Home</a> / Prices</p>

  <div class="hero">
    <h1>${esc(pricing.h1)}</h1>
    <p class="lede">${esc(pricing.intro)}</p>
  </div>

  <p class="price-note"><strong>${esc(pricing.priceLead)}</strong> ${esc(pricing.fixedFee)}</p>

  <section class="sec">
    <h2>Which one is my property</h2>
    <p>The price follows how long the building takes to inspect properly, which
      in practice means how much of it there is. Pick by what you want looked
      at, not by what you think is wrong: that is our job to work out.</p>
    <div class="bands">
${pricing.bands.map(band).join('\n')}
    </div>
    <p class="band-foot">If you are between two bands, take the smaller one and
      ask. We will tell you on site if it needs to be wider, and what that
      would cost, before doing anything.</p>
  </section>

  <section class="sec sec--extra">
    <p class="eyebrow-note">${esc(pricing.invasive.name)}</p>
    <h2>${esc(pricing.invasive.heading)}</h2>
    ${pricing.invasive.body.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>

  <section class="sec">
    <h2>What every survey includes, whichever band</h2>
    <ul class="ticks">
      ${pricing.included.map((i) => `<li>${esc(i)}</li>`).join('\n      ')}
    </ul>
  </section>

  <section class="sec">
    <h2>What is not on the invoice</h2>
    ${pricing.notIncluded.map((n) => `<h3>${esc(n.h)}</h3>\n    <p>${esc(n.p)}</p>`).join('\n    ')}
  </section>

  <section class="sec" id="faq">
    <h2>Questions about the price</h2>
    ${pricing.faq.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>`;

  const aside = `
    <div class="booking">
      <h2>Book a survey</h2>
      <p>Same day response to every enquiry, and your written report within 24
        hours of the visit. Or call <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>.</p>
      ${bookForm(site.key)}
      ${verifiedBadge(site)}
    </div>`;

  return shell({
    site,
    url,
    title: pricing.title,
    metaDescription: pricing.metaDescription,
    schemas: [offerSchema(site, url), crumbSchema(site, url), faqSchema()],
    body,
    aside,
    scripts: bookScripts(site)
  });
}
