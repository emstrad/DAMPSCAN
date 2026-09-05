/**
 * Small request/response helpers shared by every function under /api.
 */
import { createHash } from 'node:crypto';

/** Sends a JSON response with no caching. */
export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

/** Rejects anything but the expected method. */
/** `method` is one verb, or a list when a route legitimately serves several. */
export function requireMethod(req, res, method) {
  const allowed = Array.isArray(method) ? method : [method];
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  json(res, 405, { ok: false, error: 'method_not_allowed' });
  return false;
}

/**
 * Same-origin only. There is no Access-Control-Allow-Origin header anywhere in
 * this app, so a cross-origin browser fetch cannot read a response. This adds
 * the write-side half: a request that declares a foreign Origin is refused
 * outright rather than being executed and then blocked at the read.
 */
export function requireSameOrigin(req, res) {
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin GETs and non-browser clients send none

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    json(res, 403, { ok: false, error: 'forbidden_origin' });
    return false;
  }
  if (originHost === req.headers.host) return true;

  json(res, 403, { ok: false, error: 'forbidden_origin' });
  return false;
}

/**
 * The last path segment, for the dynamic route files under api/ that dispatch
 * several endpoints from one function. Read off the path rather than from
 * req.query, so a handler behaves the same when a test calls it with a bare
 * url as it does behind Vercel's router.
 */
export function actionFrom(url) {
  const path = new URL(url || '/', 'http://localhost').pathname.replace(/\/+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

/** First address in the proxy chain, or an empty string. */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length) return String(forwarded[0]).trim();
  return String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
}

let saltWarned = false;

/**
 * sha256(ip + IP_SALT). The raw address is never stored or logged, so a leaked
 * database gives up no visitor IPs, but the same visitor is still recognisable
 * for rate limiting.
 *
 * The salt is what makes that true. There are only about four billion IPv4
 * addresses, so an unsalted sha256 of one is reversible by brute force in
 * seconds, and every ip_hash in the table would be trivially readable. Missing
 * the salt is not allowed to take the booking form down, so this degrades and
 * shouts rather than throwing.
 */
export function ipHash(req) {
  const salt = process.env.IP_SALT || '';
  if (salt.length < 16 && !saltWarned) {
    saltWarned = true;
    console.warn(
      'IP_SALT is missing or too short. IP hashes are brute-forceable without it, ' +
      'so the "no raw IPs" guarantee does not hold. Set IP_SALT to a long random string.'
    );
  }
  return createHash('sha256').update(clientIp(req) + salt).digest('hex');
}

const MAX_BODY = 32 * 1024;

/** Parses a JSON body, returning {} for anything unusable. */
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) || {}; } catch { return {}; }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return {};
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Trimmed string of at most `max` characters, or null. */
export function str(value, max) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  if (!out) return null;
  return out.slice(0, max);
}
