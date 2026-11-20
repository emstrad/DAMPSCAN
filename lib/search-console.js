/**
 * Google Search Console figures for the Insights page: how often each site
 * appeared in Google, how often it was clicked, its average position, and
 * the searches and pages behind that.
 *
 * Signs in as a Google service account, from GSC_SERVICE_ACCOUNT (the JSON key
 * file's contents, set in Vercel and never committed). The account's email
 * is added as a user on each site's Search Console property, and that is the
 * whole of the setup. With no key set, everything here answers null and the
 * Insights page says how to switch it on.
 *
 * No Google library: a service account token is one signed JWT and one POST,
 * which node:crypto does, and an extra dependency in a function costs cold
 * start time on every request, not just these.
 */
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3/sites/';
const TIMEOUT_MS = 8000;
/* Search Console's figures settle about three days behind. */
const LAG_DAYS = 3;
const WINDOW_DAYS = 28;
const CACHE_MS = 60 * 60 * 1000;

/** Each brand's Search Console property. Domain properties cover www and not. */
export const PROPERTIES = {
  dampscan: 'sc-domain:dampscan.co.uk',
  'ati-london': 'sc-domain:atidampsurvey.co.uk',
  roofing: 'sc-domain:vergeroofing.com',
  ac: 'sc-domain:coolright.co.uk'
};

/**
 * The key as pasted into Vercel, forgiven the ways a paste goes wrong (the
 * owner, 20 Nov 2026, pasting from a phone): curly quotes, a stray mark at the
 * start, the file sent as base64, or line breaks inside the key itself. Only
 * the email and the private key are needed, so they are read out directly
 * when the whole file will not parse.
 */
export function readKey(raw) {
  let text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { state: 'missing' };
  if (!text.startsWith('{')) {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) text = decoded;
  }
  text = text.replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'");
  let email = null, key = null;
  try {
    const a = JSON.parse(text);
    email = a.client_email; key = a.private_key;
  } catch {
    email = (text.match(/"client_email"\s*:\s*"([^"]+)"/) || [])[1];
    key = (text.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/) || [])[0];
  }
  if (!email || !/@.+\.iam\.gserviceaccount\.com$/.test(email)) return { state: 'unreadable', why: 'No service account email (client_email) in the key.' };
  if (!key || !/BEGIN PRIVATE KEY/.test(key)) return { state: 'unreadable', why: 'No private key (private_key) in the key.' };
  key = key.replace(/\\n/g, '\n');
  return { state: 'ok', account: { client_email: email.trim(), private_key: key }, email: email.trim() };
}

function account() {
  const k = readKey(process.env.GSC_SERVICE_ACCOUNT);
  if (k.state === 'unreadable') console.warn('GSC_SERVICE_ACCOUNT:', k.why);
  return k.account || null;
}

/** For Settings: missing, unreadable (and why) or ok with the robot's email, never the key. */
export function searchConsoleState() {
  const { state, why, email } = readKey(process.env.GSC_SERVICE_ACCOUNT);
  return { state, why: why || null, email: email || null };
}

export const searchConsoleConfigured = () => Boolean(account());

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** The signed assertion Google swaps for an access token. */
export function assertion(acct, nowSeconds = Math.floor(Date.now() / 1000)) {
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({ iss: acct.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 });
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${signer.sign(acct.private_key).toString('base64url')}`;
}

let cachedToken = null;
async function accessToken(acct) {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(acct) }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`Google sign-in refused (${res.status})`);
  const data = await res.json();
  cachedToken = { value: data.access_token, until: Date.now() + (Number(data.expires_in || 3600) - 120) * 1000 };
  return cachedToken.value;
}

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

async function analytics(token, property, body) {
  const res = await fetch(`${API}${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (res.status === 403) throw new Error('not_shared');
  if (!res.ok) throw new Error(`Search Console answered ${res.status}`);
  return (await res.json()).rows || [];
}

const round = (n, places) => Math.round(Number(n || 0) * 10 ** places) / 10 ** places;
const totals = (rows) => {
  const r = rows[0] || {};
  return { clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0), ctr: round((r.ctr || 0) * 100, 1), position: round(r.position, 1) };
};

const cache = new Map();

/**
 * The last 28 settled days for one brand, against the 28 before them, with
 * the top searches and pages. Cached for an hour, since the figures only
 * move once a day.
 */
export async function searchFor(site) {
  const acct = account();
  const property = PROPERTIES[site];
  if (!acct || !property) return null;
  const hit = cache.get(site);
  if (hit && hit.until > Date.now()) return hit.value;
  let value;
  try {
    const token = await accessToken(acct);
    const end = day(LAG_DAYS);
    const start = day(LAG_DAYS + WINDOW_DAYS - 1);
    const prevEnd = day(LAG_DAYS + WINDOW_DAYS);
    const prevStart = day(LAG_DAYS + 2 * WINDOW_DAYS - 1);
    const [now, before, queries, pages] = await Promise.all([
      analytics(token, property, { startDate: start, endDate: end }),
      analytics(token, property, { startDate: prevStart, endDate: prevEnd }),
      analytics(token, property, { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 25 }),
      analytics(token, property, { startDate: start, endDate: end, dimensions: ['page'], rowLimit: 15 })
    ]);
    const row = (r) => ({ key: r.keys[0], clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0), position: round(r.position, 1) });
    value = { site, property, from: start, to: end, now: totals(now), before: totals(before), queries: queries.map(row), pages: pages.map(row) };
  } catch (err) {
    console.warn(`search console for ${site} failed:`, err.message);
    value = { site, property, error: err.message === 'not_shared' ? 'not_shared' : 'unavailable' };
  }
  cache.set(site, { value, until: Date.now() + (value.error ? 5 * 60 * 1000 : CACHE_MS) });
  return value;
}
