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
   into the only tag this is allowed to introduce. */
const body = (text) => esc(text).split('\n').join('<br />');

function card(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  return `<article class="review"><div class="stars" aria-label="${rating}` +
    ` out of 5 stars">${'&#9733;'.repeat(rating)}</div><p>${body(review.text)}` +
    `</p><div class="review-attr"><span>${esc(review.author)}</span>` +
    `<span class="src">Google review</span></div></article>`;
}

/* The marquee translates one track by half its width, so it needs two copies of
   the cards to loop without a gap. The second copy is decoration. */
const track = (list) => list.map(card).join('') + list.map(card).join('');

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
