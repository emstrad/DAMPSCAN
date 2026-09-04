/**
 * Postcode to address lookup.
 *
 * There is no free source for this in the UK. Listing the actual delivery
 * points in a postcode means Royal Mail's Postcode Address File, which is
 * licensed, so every provider that can do it charges for it. postcodes.io is
 * free and excellent but returns coordinates and administrative areas, not
 * addresses, so it cannot answer the only question this file exists to answer.
 *
 * The practical consequence: this is optional. With no key configured it says
 * so plainly and the form falls back to three typed fields, which still gets
 * the full address onto the lead. That was the actual problem, and it is solved
 * without spending anything. A key upgrades typing into picking.
 *
 * getAddress.io is the provider wired up because its response is the simplest
 * to normalise, but the shape below is deliberately small: another provider is
 * a second `fetchFrom` function and a line in PROVIDERS, not a rewrite.
 */
import { normalisePostcode } from './validate.js';

const TIMEOUT_MS = 4000;

/** Trimmed, non-empty, capped. Provider data is somebody else's input. */
const line = (value, max = 120) => {
  const out = String(value ?? '').trim().replace(/\s+/g, ' ');
  return out ? out.slice(0, max) : '';
};

/**
 * getAddress.io returns an array of comma separated strings with fixed slots:
 * line1, line2, line3, line4, locality, town, county. Empty slots are common,
 * so they are filtered rather than positionally trusted.
 */
async function getAddressIo(postcode, key, signal) {
  const url = `https://api.getaddress.io/find/${encodeURIComponent(postcode)}?api-key=${encodeURIComponent(key)}&expand=true`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return { ok: true, addresses: [] };
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };

  const data = await res.json();
  const list = Array.isArray(data.addresses) ? data.addresses : [];
  return {
    ok: true,
    addresses: list.map((a) => {
      const parts = [a.line_1, a.line_2, a.line_3, a.line_4].map((p) => line(p)).filter(Boolean);
      return {
        line1: parts[0] || '',
        line2: parts.slice(1).join(', '),
        town: line(a.town_or_city || a.locality, 80),
        label: [...parts, line(a.town_or_city, 80)].filter(Boolean).join(', ')
      };
    }).filter((a) => a.line1)
  };
}

const PROVIDERS = { getaddress: getAddressIo };

/**
 * @returns {Promise<{ok:boolean, configured:boolean, addresses:object[], reason?:string}>}
 *   configured false means no key: the caller should offer typed fields rather
 *   than treat it as a failure, because it is not one.
 */
export async function lookupAddresses(rawPostcode) {
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) return { ok: false, configured: true, addresses: [], reason: 'bad_postcode' };

  const key = (process.env.ADDRESS_API_KEY || '').trim();
  const name = (process.env.ADDRESS_PROVIDER || 'getaddress').trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!key || !provider) return { ok: true, configured: false, addresses: [] };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const out = await provider(postcode, key, abort.signal);
    if (!out.ok) return { ok: false, configured: true, addresses: [], reason: out.reason };
    return { ok: true, configured: true, postcode, addresses: out.addresses };
  } catch (err) {
    /* A lookup that times out must not block a booking, so the caller treats
       this exactly like no key: typed fields, no error shown. */
    return { ok: false, configured: true, addresses: [], reason: String(err.name === 'AbortError' ? 'timeout' : err.message).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}
