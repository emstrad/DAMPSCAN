/**
 * The review carousel, rendered from content/reviews at build time.
 *
 * Two sources can fill this section and they agree on the card markup, so they
 * look identical: this file writes the reviews we hold into the HTML, and the
 * page script replaces them at runtime if /api/reviews returns a live set from
 * Google. Both obey the same floor. Below MIN_REVIEWS the section ships empty
 * and hidden, because a carousel of two reads worse than no carousel.
 *
 * Rendering here rather than in the browser matters for the same reason it did
 * for the service copy: AI crawlers do not run JavaScript, so a review that
 * only exists after a fetch is a review they never see.
 */
import { MIN_REVIEWS } from '../lib/google-reviews.js';
import { reviews } from '../content/reviews/index.js';
import { SITES } from './area-template.js';

export const START = '<!-- reviews:start, filled by scripts/build-pages.js -->';
export const END = '<!-- reviews:end -->';

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Reviewers use line breaks. Escape first, then turn the newlines they typed
   into the only tag this is allowed to introduce.
   The em dash goes out as an entity. A reviewer is entitled to type one and it
   must reach the page exactly as written, but the repository bans the literal
   character and this output is committed, so the entity satisfies both. */
const body = (text) =>
  esc(text).split('\n').join('<br />').replace(/\u2014/g, '&mdash;');

const words = (list) => list.filter((r) => String(r.text || '').trim());
const wordless = (list) => list.filter((r) => !String(r.text || '').trim());

/**
 * One card. `review.authors` carries more than one name for a paired card of
 * ratings with no words; a single review is just the one name.
 */
function card(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const text = String(review.text || '').trim();
  const names = review.authors || [review.author];
  const said = text ? `<p>${body(text)}</p>` : '';
  const bare = text ? '' : ' review--stars-only';
  /* "A and B", or "A, B and C" if a third ever turns up. */
  const attr = names.length > 1
    ? names.slice(0, -1).map(esc).join(', ') + ' and ' + esc(names[names.length - 1])
    : esc(names[0]);
  return `<article class="review${bare}"><div class="stars" aria-label="${rating}` +
    ` out of 5 stars">${'&#9733;'.repeat(rating)}</div>${said}` +
    `<div class="review-attr"><span>${attr}</span>` +
    `<span class="src">Google review</span></div></article>`;
}

/**
 * The cards one copy of the track carries, which is not one per review.
 *
 * Some people leave stars and write nothing. Those ratings are real and belong
 * on the wall, but a card holding only a name reads as a card whose text failed
 * to load, and two of them in a row reads as a bug. So they are paired: one
 * card, two names, the stars they both gave. An odd one out stands alone.
 *
 * Exported because the count is now derived rather than obvious, and the test
 * that checks the shipped HTML should not have to reimplement this.
 */
export function cardsFor(list) {
  const out = words(list).map((r) => card(r));
  const bare = wordless(list);
  for (let i = 0; i < bare.length; i += 2) {
    const pair = bare.slice(i, i + 2);
    out.push(card({ rating: pair[0].rating, text: '', authors: pair.map((r) => r.author) }));
  }
  return out;
}

/* The marquee translates one track by half its width, so it needs two copies of
   the cards to loop without a gap. The second copy is decoration. */
const track = (list) => { const c = cardsFor(list).join(''); return c + c; };

/**
 * @param {string} site key into SITES
 * @returns {string} the block between the markers, markers included
 */
export function reviewsBlock(site) {
  const list = reviews[site] || [];
  const show = list.length >= MIN_REVIEWS;
  const hide = show ? '' : ' hidden';
  const url = SITES[site].profileUrl;
  const link = url
    ? ` <a href="${esc(url)}" rel="noopener" target="_blank">Read them on Google</a>`
    : '';

  return `${START}
  <div class="carousel" aria-label="Customer reviews"${hide}><div class="carousel-track" id="track-a">${
    show ? track(list) : ''
  }</div></div>
  <div class="carousel" aria-hidden="true"${hide}><div class="carousel-track rev" id="track-b">${
    show ? track(list.slice().reverse()) : ''
  }</div></div>
  <div class="container">
    <p class="reviews-source" id="reviews-source"${hide}>Reviews from our Google Business Profile.${link}</p>
  </div>
  ${END}`;
}

/** What the build prints, so a site sitting below the floor is not a surprise. */
export function reviewsSummary(site) {
  const count = (reviews[site] || []).length;
  return count >= MIN_REVIEWS
    ? `${site}: ${count} reviews shown`
    : `${site}: ${count} reviews held, needs ${MIN_REVIEWS}`;
}
