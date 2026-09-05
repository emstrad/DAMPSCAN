/**
 * Postcode to address lookup.
 *
 * Read this before buying a provider, because the ground moved in early 2026.
 *
 * The complete list of UK delivery points is Royal Mail's Postcode Address
 * File, and it is licensed. getAddress.io, which this file used to call and
 * which was the cheap option everyone reached for, shut down on 4 February
 * 2026, after the High Court found in October 2025 that its data infringed the
 * database rights and copyright of Royal Mail and of Ideal Postcodes. The
 * lesson worth carrying: a provider well under the licensed rate may be under
 * it because it is not licensed, and its customers are the ones left with a
 * dead endpoint.
 *
 * What is genuinely free is postcodes.io, which returns coordinates and
 * administrative areas rather than delivery points, so it cannot answer the
 * only question this file exists to answer. What is free in small amounts is
 * most licensed providers: a trial, or a monthly allowance in the low
 * hundreds of lookups. At this site's volume that allowance may well be the
 * whole story, which is the case for picking a licensed one and staying inside
 * its free tier rather than hunting for an unlimited free source.
 *
 * So this file is provider agnostic. Nearly every UK provider returns PAF's
 * own field names, because they are all reselling the same file, so there is
 * one parser rather than an adapter each: point ADDRESS_API_URL at whichever
 * you buy and it should work untouched.
 *
 * None of it is required. With no key the form asks people to type the
 * address, which still gets the full address onto the lead.
 */
import { normalisePostcode } from './validate.js';

const TIMEOUT_MS = 4000;

/* Ideal Postcodes: licensed, and the party that won the case above. Overridable
   because the point of this file is that the provider is a setting. */
const DEFAULT_URL = 'https://api.ideal-postcodes.co.uk/v1/postcodes/{postcode}?api_key={key}';

/** Trimmed, non-empty, capped. Provider data is somebody else's input. */
const line = (value, max = 120) => {
  const out = String(value ?? '').trim().replace(/\s+/g, ' ');
  return out ? out.slice(0, max) : '';
};

/* British place names do not title case by capitalising every word: it is
   Stoke-on-Trent and Weston-super-Mare, not Stoke-On-Trent, and King's Lynn,
   not King'S Lynn. So connectors stay down and a letter after an apostrophe is
   left alone. (That gives O'brien rather than O'Brien, which no post town is.) */
const CONNECTORS = new Set([
  'on', 'upon', 'under', 'super', 'in', 'of', 'the', 'and',
  'le', 'la', 'de', 'cum', 'next', 'by', 'en', 'sur'
]);

/* Royal Mail's own style is an all caps post town, so providers return LONDON
   rather than London. Correct on an envelope, shouty in a form field. Anything
   already mixed case came from a provider that has done this itself. */
function tidyTown(value) {
  const out = line(value, 80);
  if (!out || out !== out.toUpperCase()) return out;
  return out.toLowerCase().replace(/[a-z]+/g, (word, at, whole) => {
    if (at > 0 && whole[at - 1] === "'") return word;
    if (at > 0 && CONNECTORS.has(word)) return word;
    return word[0].toUpperCase() + word.slice(1);
  });
}

/**
 * Finds the array of addresses wherever this provider happens to put it.
 * Ideal Postcodes uses `result`, others use `addresses` or answer with a bare
 * array. Guessing here is cheap; being wrong costs a fallback to typing.
 */
function addressList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['result', 'addresses', 'Addresses', 'results', 'items']) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (data.result && Array.isArray(data.result.hits)) return data.result.hits;
  return [];
}

/**
 * PAF field names, with the aliases providers vary on. A plain comma separated
 * string is also accepted, because some return one when not asked to expand.
 */
function mapAddress(entry) {
  if (typeof entry === 'string') {
    const bits = entry.split(',').map((p) => line(p)).filter(Boolean);
    if (!bits.length) return null;
    const town = tidyTown(bits.length > 1 ? bits[bits.length - 1] : '');
    const rest = bits.length > 1 ? bits.slice(0, -1) : bits;
    return { line1: rest[0], line2: rest.slice(1).join(', '), town, label: [...rest, town].filter(Boolean).join(', ') };
  }
  if (!entry || typeof entry !== 'object') return null;

  const parts = [entry.line_1, entry.line_2, entry.line_3, entry.line_4]
    .map((p) => line(p))
    .filter(Boolean);
  if (!parts.length) return null;

  const town = tidyTown(entry.post_town || entry.town_or_city || entry.town || entry.locality);
  return {
    line1: parts[0],
    line2: parts.slice(1).join(', '),
    town,
    label: [...parts, town].filter(Boolean).join(', ')
  };
}

/** Neither value is ever logged, so a key cannot leak through a warn line. */
function buildUrl(template, postcode, key) {
  return template
    .replaceAll('{postcode}', encodeURIComponent(postcode))
    .replaceAll('{key}', encodeURIComponent(key));
}

/**
 * @returns {Promise<{ok:boolean, configured:boolean, addresses:object[], reason?:string}>}
 *   configured false means no key: the caller should offer typed fields rather
 *   than treat it as a failure, because it is not one.
 */
export async function lookupAddresses(rawPostcode) {
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) return { ok: false, configured: true, addresses: [], reason: 'bad_postcode' };

  const key = (process.env.ADDRESS_API_KEY || '').trim();
  const template = (process.env.ADDRESS_API_URL || DEFAULT_URL).trim();
  if (!key || !template.includes('{postcode}')) return { ok: true, configured: false, addresses: [] };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(template, postcode, key), {
      signal: abort.signal,
      headers: { Accept: 'application/json' }
    });

    // A postcode nobody lives at is a normal answer, not a fault.
    if (res.status === 404) return { ok: true, configured: true, postcode, addresses: [] };
    if (!res.ok) return { ok: false, configured: true, addresses: [], reason: `http_${res.status}` };

    const data = await res.json();
    const addresses = addressList(data).map(mapAddress).filter(Boolean);
    return { ok: true, configured: true, postcode, addresses };
  } catch (err) {
    /* A lookup that times out must not block a booking, so the caller treats
       this exactly like no key: typed fields, no error shown. */
    const reason = err.name === 'AbortError' ? 'timeout' : String(err.message || err).slice(0, 80);
    return { ok: false, configured: true, addresses: [], reason };
  } finally {
    clearTimeout(timer);
  }
}
