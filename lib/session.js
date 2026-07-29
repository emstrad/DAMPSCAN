/**
 * Staff session cookie.
 *
 * The only cookie the site sets. httpOnly so no script can read it, Secure so it
 * never travels in clear, SameSite=Lax so it is not attached to cross-site POSTs.
 * The payload is signed with SESSION_SECRET rather than encrypted: it holds
 * nothing secret, and the signature is what stops it being edited.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { json } from './http.js';

export const COOKIE_NAME = 'ds_staff';
export const MAX_AGE_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 24) {
    throw new Error('SESSION_SECRET is missing or too short (needs 24 or more characters)');
  }
  return value;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function signature(body) {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function signSession(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${signature(body)}`;
}

/** Returns the payload, or null if the token is absent, edited or expired. */
export function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const index = token.lastIndexOf('.');
  const body = token.slice(0, index);
  const provided = token.slice(index + 1);

  let expected;
  try {
    expected = signature(body);
  } catch {
    return null;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function issueSession(res, user) {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    sub: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role,
    jti: randomBytes(8).toString('base64url'),
    iat: now,
    exp: now + MAX_AGE_SECONDS
  });
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`
  ].join('; '));
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; '));
}

export function readSession(req) {
  return verifySession(parseCookies(req)[COOKIE_NAME]);
}

/**
 * Guard for every /api/admin/* route. Returns the session, or null after having
 * already sent a 401. Callers should return immediately on null.
 */
export function requireAuth(req, res) {
  const session = readSession(req);
  if (session) return session;
  json(res, 401, { ok: false, error: 'unauthorised' });
  return null;
}
