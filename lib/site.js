/**
 * Which of the two sites a request came from.
 *
 * One deployment serves both domains, so every lead and event is tagged with
 * its origin. Derived from the Host header rather than trusted from the client,
 * for the same reason channel and device are.
 */
const SITES = {
  'atidampsurvey.co.uk': 'ati-london',
  'dampscan.co.uk': 'dampscan'
};

export const SITE_KEYS = ['dampscan', 'ati-london'];
export const DEFAULT_SITE = 'dampscan';

export function siteFor(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = String(raw).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (SITES[host]) return SITES[host];
  // Preview deployments and the vercel.app hostnames fall back to the brand
  // whose name they carry, so a preview does not silently land in the wrong bucket.
  if (host.includes('atidampsurvey') || host.includes('ati-')) return 'ati-london';
  return DEFAULT_SITE;
}

/** Normalises a ?site= filter from the dashboard. Null means "both". */
export function normaliseSite(value) {
  return SITE_KEYS.includes(value) ? value : null;
}
