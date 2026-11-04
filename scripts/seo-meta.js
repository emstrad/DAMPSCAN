/**
 * Search result titles and descriptions for the area pages.
 *
 * Search Console showed the area pages being seen hundreds of times and
 * clicked almost never. The old titles named the service and the place and
 * stopped, which is what every other result on the page says too. These lead
 * with the query people type ("damp survey in <town>"), then give a reason to
 * pick this result, then the brand, and fall back to shorter forms when a long
 * place name would push the title past what Google shows (about 60 characters).
 *
 * Every claim here is one the site already makes in its own copy: a qualified
 * surveyor, a 24 hour report, and, for both brands now, independence and no
 * remedial work. The two brands still word it differently (Kent and London),
 * so the two sites never show the same snippet. No prices: the owners asked
 * for none in results.
 */
import { reviews } from '../content/reviews/index.js';
import { MIN_REVIEWS } from '../lib/google-reviews.js';

export const TITLE_MAX = 60;
export const DESC_MAX = 155;

/* "Tonbridge and Malling" reads fine in a heading but costs characters a title
   does not have. */
const short = (name) => String(name).replace(/ and /g, ' & ');

/**
 * True only when every review we hold is five stars and there are enough of
 * them for the home page to show. The count is not quoted, because the live
 * Google total moves and a stale number in a snippet is a claim we cannot keep.
 */
export function fiveStar(site) {
  const list = reviews[site] || [];
  return list.length >= MIN_REVIEWS && list.every((r) => Number(r.rating) === 5);
}

const TITLES = {
  dampscan: (n) => [
    `Damp Surveys in ${n}, Kent | Independent | DampScan`,
    `Damp Surveys in ${n} | Independent | DampScan`,
    `Damp Surveys in ${n} | DampScan`
  ],
  ati: (n) => [
    `Damp Survey in ${n} | Independent, Next-Day Report | ATi Damp Survey`,
    `Independent Damp Survey in ${n} | ATi Damp Survey`,
    `Damp Survey in ${n} | ATi Damp Survey`
  ]
};

/* First candidate that fits wins. Neither brand sells damp proofing, so a
   survey title never offers it: the searches for it are answered by the
   /damp-proofing/<place> pages, whose titles say "survey first". */
export function areaTitle(area) {
  const make = TITLES[area.site];
  if (!make) return area.title;
  const list = make(short(area.name));
  return list.find((t) => t.length <= TITLE_MAX) || list[list.length - 1];
}

const LEADS = {
  dampscan: (n) => `Damp and mould surveys across ${n} by an independent Kent surveyor. No treatment sold, report the next day.`,
  ati: (n) => `Independent damp and mould survey in ${n}. We sell no treatment, so no hard sell. Next-day written report.`
};

/**
 * Lead sentence, then the review line, then nearby places, each only if it
 * still fits. The places are what make thirty descriptions genuinely thirty
 * different descriptions rather than one with a name swapped in.
 */
export function areaDescription(area) {
  const lead = LEADS[area.site];
  if (!lead) return area.metaDescription;
  let out = lead(area.name);
  const add = (s) => { if ((out + ' ' + s).length <= DESC_MAX) out += ' ' + s; };
  if (fiveStar(area.site)) add('5-star Google reviews.');
  const places = (area.places || []).filter((p) => p !== area.name);
  for (let k = Math.min(3, places.length); k >= 1; k--) {
    const list = places.slice(0, k);
    const s = `Covering ${list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]}.`;
    if ((out + ' ' + s).length <= DESC_MAX) { out += ' ' + s; break; }
  }
  return out;
}

/* ------------------------------------------------ town and proofing pages */

const fit = (list) => list.find((t) => t.length <= TITLE_MAX) || list[list.length - 1];

/** A DampScan town survey page. "Damp Survey in <town>" is the query. */
export function townTitle(t) {
  const n = short(t.name);
  return fit([`Damp Survey in ${n}, Kent | Independent | DampScan`, `Damp Survey in ${n} | Independent | DampScan`, `Damp Survey in ${n} | DampScan`]);
}

function withPlaces(out, places, name) {
  const list = (places || []).filter((p) => p !== name);
  for (let k = Math.min(3, list.length); k >= 1; k--) {
    const l = list.slice(0, k);
    const s = `Covering ${l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0]}.`;
    if ((out + ' ' + s).length <= DESC_MAX) return out + ' ' + s;
  }
  return out;
}

export function townDescription(t) {
  let out = `Damp survey in ${t.name} by an independent surveyor: cause found with readings, no treatment sold, next-day written report.`;
  if (fiveStar('dampscan') && (out + ' 5-star Google reviews.').length <= DESC_MAX) out += ' 5-star Google reviews.';
  return withPlaces(out, t.places, t.name);
}

/** "damp proofing <place>" pages: always "survey first", never an offer of
    the work, because neither brand does it. */
export function proofingTitle(p) {
  const n = short(p.name);
  if (p.site === 'ati') {
    return fit([`Damp Proofing in ${n}? Survey First | ATi Damp Survey`, `Damp Proofing ${n}? Survey First | ATi Damp Survey`, `Damp Proofing ${n}? Survey First | ATi`]);
  }
  return fit([`Damp Proofing in ${n}? Get a Survey First | DampScan`, `Damp Proofing in ${n}? Survey First | DampScan`, `Damp Proofing ${n}? Survey First | DampScan`]);
}

export function proofingDescription(p) {
  const out = p.site === 'ati'
    ? `Quoted for damp proofing in ${p.name}? An independent London survey finds the cause first. We do no remedial work. Report the next day.`
    : `Thinking of damp proofing in ${p.name}? Get an independent survey first. We sell no treatment, so you only pay for what the wall needs.`;
  return withPlaces(out, p.places, p.name);
}
