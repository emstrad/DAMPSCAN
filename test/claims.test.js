/**
 * Claims made on the public pages.
 *
 * Everything a visitor reads has to be something we could stand up if asked.
 * The site previously carried invented testimonials, an invented star average
 * and accreditation badges for schemes we are not members of. They are gone,
 * and this file is what stops them coming back the next time someone needs a
 * page to look busier.
 *
 * It reads the shipped HTML rather than the generators, because the generators
 * are not the thing served.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { reviews } from '../content/reviews/index.js';
import { MIN_REVIEWS } from '../lib/google-reviews.js';

/** The same transformation the builder applies, so quotes compare like for like. */
const escapeAsRendered = (text) =>
  String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .split('\n').join('<br />');

const PUBLIC = new URL('../public/', import.meta.url).pathname;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

const PAGES = htmlFiles(PUBLIC).map((path) => ({
  path: path.slice(PUBLIC.length),
  html: readFileSync(path, 'utf8')
}));

/* The page script contains the same card markup as a string, because it renders
   live reviews with it. Markup checks run against the document only, so that
   template is not mistaken for a card on the page. Phrase checks keep the
   scripts, since an invented quote could just as easily hide in one. */
const HOMES = ['index.html', 'london.html'].map((name) => {
  const html = readFileSync(join(PUBLIC, name), 'utf8');
  return {
    name,
    site: name === 'index.html' ? 'dampscan' : 'ati',
    html,
    markup: html.replace(/<script[\s\S]*?<\/script>/g, '')
  };
});

test('the shipped pages exist to be checked at all', () => {
  assert.ok(PAGES.length > 50, `expected the generated pages, found ${PAGES.length}`);
});

/* A star average we did not compute from reviews we can produce is the single
   riskiest claim on a trades site, and the one Google's structured data policy
   names directly. Neither the visible text nor the schema may carry one. */
test('no page claims a star average or a review count', () => {
  const banned = [
    'aggregateRating', 'AggregateRating', 'ratingValue', 'reviewCount',
    '4.9 out of 5', '120+', 'verified reviews'
  ];
  for (const { path, html } of PAGES) {
    for (const phrase of banned) {
      assert.ok(!html.includes(phrase), `${path} still claims "${phrase}"`);
    }
  }
});

/* Membership badges for schemes we are not in. SurveyMate is the exception and
   stays, because that listing is real and the badge is served by SurveyMate. */
test('no page claims an accreditation we do not hold', () => {
  for (const { path, html } of PAGES) {
    for (const scheme of ['Checkatrade', 'Trustpilot']) {
      assert.ok(!html.includes(scheme), `${path} still claims ${scheme}`);
    }
  }
});

/* The placeholder testimonials, by the words that were unique to them. A name
   check alone would miss a reworded reappearance of the same invented quote. */
test('no invented testimonial survives on any page', () => {
  const invented = [
    'James M.', 'Claire B.', 'Tom H.', 'Rachel D.',
    'Mike S.', 'Priya N.', 'David O.', 'Helen T.',
    'Homeowner, SE22', 'Buyer, N4', 'Landlord, E8', 'Homeowner, SW11',
    'Leaseholder, W9', 'Buyer, SE13', 'Homeowner, NW6', 'Managing agent, EC1',
    'The surveyor was thorough and honest',
    'Found the source of our damp within an hour',
    'Saved us from buying a problem property',
    'We were quoted £9,400 for injection',
    'blocked gully and raised patio',
    'three previous tanking attempts'
  ];
  for (const { path, html } of PAGES) {
    for (const phrase of invented) {
      assert.ok(!html.includes(phrase), `${path} still carries the placeholder "${phrase}"`);
    }
  }
});

/* The strong guarantee, and the reason the placeholder quotes cannot come back
   in another form: every card on a shipped page must be traceable to a review
   sitting in content/reviews, matched on the reviewer's own words. */
test('every review card on a home page comes from content/reviews', () => {
  for (const { name, site, markup } of HOMES) {
    const held = reviews[site];
    const cards = markup.match(/<article class="review">[\s\S]*?<\/article>/g) || [];
    for (const card of cards) {
      const quoted = card.match(/<p>([\s\S]*?)<\/p>/)[1];
      const match = held.find((r) => quoted.startsWith(escapeAsRendered(r.text).slice(0, 60)));
      assert.ok(match, `${name}: a card quotes words no held review contains: ${quoted.slice(0, 70)}`);
      assert.ok(card.includes(`<span>${match.author}</span>`), `${name}: ${match.author} is misattributed`);
    }
  }
});

/* Below the floor the section ships empty and hidden, so a thin set of real
   reviews is absent rather than displayed as if it were a full one. */
test('a carousel is visible only where the site is at or above the floor', () => {
  for (const { name, site, markup } of HOMES) {
    const enough = reviews[site].length >= MIN_REVIEWS;
    const carousels = markup.match(/<div class="carousel"[^>]*>/g) || [];
    assert.equal(carousels.length, 2, `${name}: expected two carousels`);
    for (const tag of carousels) {
      assert.equal(/\shidden\b/.test(tag), !enough, `${name}: wrong visibility for ${reviews[site].length} reviews`);
    }
    const cards = (markup.match(/<article class="review">/g) || []).length;
    // Each track carries the list twice, because the marquee loops on two copies.
    assert.equal(cards, enough ? reviews[site].length * 4 : 0, `${name}: unexpected card count`);
  }
});

/* Removing the quotes was not allowed to remove the section. Each home page
   still answers "what do I actually get" in its own words. */
test('both home pages replaced the quotes with what the client receives', () => {
  for (const { name, html } of HOMES) {
    assert.ok(html.includes('id="reviews"'), `${name}: the section was dropped rather than refilled`);
    assert.ok(html.includes('class="ll-list deliverables"'), `${name}: no deliverables list`);
    const items = html.match(/class="ll-list deliverables"[\s\S]*?<\/ul>/)[0].match(/<li>/g) || [];
    assert.ok(items.length >= 5, `${name}: only ${items.length} deliverables listed`);
  }
});

/* Google's terms require its data to be attributed where it is shown. The line
   ships hidden alongside the carousel and is revealed by the same code path. */
test('both home pages credit Google, shown or hidden with the carousel', () => {
  for (const { name, site, markup } of HOMES) {
    const enough = reviews[site].length >= MIN_REVIEWS;
    const line = markup.match(/<p class="reviews-source"[^>]*>/);
    assert.ok(line, `${name}: no attribution line`);
    assert.equal(/\shidden\b/.test(line[0]), !enough, `${name}: attribution visibility does not match the carousel`);
    assert.ok(markup.includes('Google Business Profile'), `${name}: the source is not named`);
  }
});
