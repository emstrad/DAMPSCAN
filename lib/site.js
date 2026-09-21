/**
 * Which brand a request came from.
 *
 * One deployment serves four domains, so every lead and event is tagged with
 * its origin. Derived from the Host header rather than trusted from the client,
 * for the same reason channel and device are.
 *
 * This knew two hosts and fell back to DampScan for anything else, which was
 * fine for two brands and quietly wrong for four: an enquiry from the roofing
 * or air conditioning site was stored as a damp lead, counted in damp's
 * figures and shown on the damp board. Adding a brand here is now the whole
 * change on the request side.
 *
 * ATi's key is "ati-london" rather than "ati" because that is what the leads
 * table has stored since the London site launched, and renaming stored data
 * to tidy a string is how a dashboard loses a year of history.
 */
const SITES = {
  'atidampsurvey.co.uk': 'ati-london',
  'dampscan.co.uk': 'dampscan',
  'vergeroofing.com': 'roofing',
  'coolright.co.uk': 'ac'
};

export const SITE_KEYS = ['dampscan', 'ati-london', 'roofing', 'ac'];
export const DEFAULT_SITE = 'dampscan';

export function siteFor(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = String(raw).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (SITES[host]) return SITES[host];
  // Preview deployments and the vercel.app hostnames fall back to the brand
  // whose name they carry, so a preview does not silently land in the wrong bucket.
  if (host.includes('atidampsurvey') || host.includes('ati-')) return 'ati-london';
  if (host.includes('vergeroofing') || host.includes('roofing')) return 'roofing';
  if (host.includes('coolright')) return 'ac';
  return DEFAULT_SITE;
}

/** Normalises a ?site= filter from the dashboard. Null means "all". */
export function normaliseSite(value) {
  return SITE_KEYS.includes(value) ? value : null;
}
