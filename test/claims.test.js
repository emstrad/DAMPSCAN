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

const HOMES = ['index.html', 'london.html'].map((name) => ({
  name,
  html: readFileSync(join(PUBLIC, name), 'utf8')
}));

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

/* The carousel is kept so a real feed can drop into it. It ships empty and
   hidden, and only /api/reviews may fill it, so an empty feed is an absent
   section rather than a section of nothing. */
test('both home pages ship the review carousel empty and hidden', () => {
  for (const { name, html } of HOMES) {
    assert.match(html, /<div class="carousel-track" id="track-a"><\/div>/, `${name}: track A is not empty`);
    assert.match(html, /<div class="carousel-track rev" id="track-b"><\/div>/, `${name}: track B is not empty`);
    const carousels = html.match(/<div class="carousel"[^>]*>/g) || [];
    assert.equal(carousels.length, 2, `${name}: expected two carousels`);
    for (const tag of carousels) {
      assert.match(tag, /\shidden\b/, `${name}: a carousel ships visible: ${tag}`);
    }
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
test('both home pages carry a hidden Google attribution for the live feed', () => {
  for (const { name, html } of HOMES) {
    assert.match(html, /id="reviews-source" hidden/, `${name}: no attribution line`);
    assert.ok(html.includes('Google Business Profile'), `${name}: the source is not named`);
  }
});
