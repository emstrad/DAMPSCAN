/**
 * Turns a referrer plus campaign parameters into a single channel label, and a
 * user-agent string into a coarse device class. Both are derived on the server
 * so the client cannot invent them.
 */

// Patterns are bare domains or labels, matched on label boundaries by `matches`
// below. Webmail is listed first and tested first: mail.google.com has to read
// as email, and it contains "google", so search cannot get first look.
const MAIL_HOSTS = [
  'mail', 'webmail', 'email', 'e-mail', 'outlook', 'office.com', 'hotmail',
  'mailchimp', 'sendgrid', 'list-manage.com', 'campaign-archive.com'
];

const SEARCH_HOSTS = [
  'google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'baidu', 'yandex',
  'startpage', 'qwant', 'brave', 'search.brave', 'ask', 'aol', 'mojeek', 'searx'
];

const SOCIAL_HOSTS = [
  'facebook', 'fb', 'instagram', 'twitter', 'x.com', 't.co', 'linkedin',
  'lnkd.in', 'tiktok', 'reddit', 'pinterest', 'youtube', 'youtu.be',
  'nextdoor', 'threads', 'whatsapp', 'wa.me', 'snapchat', 'mumsnet'
];

const PAID_MEDIUMS = ['cpc', 'ppc', 'paid', 'cpm', 'cpv', 'display', 'retargeting'];

/** Hostname of a referrer, lowercased and without a leading www. Null when absent. */
export function referrerHost(referrer) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Label-boundary match, never a bare substring. Plain `includes` would read
 * dailymail.co.uk as webmail and notgoogle.com as Google. A pattern matches only
 * as a run of whole dot-separated labels, at any position, so m.facebook.com and
 * us1.list-manage.com both resolve while dailymail.co.uk does not.
 */
function matches(host, list) {
  if (!host) return false;
  const labels = host.split('.');
  return list.some((needle) => {
    const parts = needle.split('.');
    for (let i = 0; i + parts.length <= labels.length; i += 1) {
      if (parts.every((part, j) => labels[i + j] === part)) return true;
    }
    return false;
  });
}

/**
 * Campaign parameters win, because a tagged link states its channel outright.
 * Only when there is nothing to go on does the referrer host decide.
 */
export function channelFor({ utm = {}, referrer = null } = {}) {
  const medium = String(utm.utm_medium || '').toLowerCase();
  const source = String(utm.utm_source || '').toLowerCase();

  if (utm.gclid || utm.fbclid) return 'paid';
  if (medium && PAID_MEDIUMS.some((m) => medium.includes(m))) return 'paid';
  if (medium === 'email' || medium === 'e-mail' || medium === 'newsletter') return 'email';
  if (medium.includes('social') || (source && matches(source, SOCIAL_HOSTS))) return 'social';
  if (medium === 'organic' || (source && matches(source, SEARCH_HOSTS))) return 'organic';
  if (source && matches(source, MAIL_HOSTS)) return 'email';
  if (medium === 'referral') return 'referral';

  const host = referrerHost(referrer);
  if (!host) return source || medium ? 'referral' : 'direct';
  // Webmail before search: mail.google.com contains "google" and must not be
  // credited to organic.
  if (matches(host, MAIL_HOSTS)) return 'email';
  if (matches(host, SEARCH_HOSTS)) return 'organic';
  if (matches(host, SOCIAL_HOSTS)) return 'social';
  return 'referral';
}

/** mobile / tablet / desktop. Tablets are checked first because most also say "Mobile". */
export function deviceFor(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'desktop';
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}
