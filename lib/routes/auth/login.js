/**
 * POST /api/auth/login
 *
 * Single shared access code, no email and no password. The code itself lives in
 * STAFF_ACCESS_CODE and is never committed: this repository is public, and the
 * dashboard behind this endpoint holds customer names, emails, phone numbers,
 * postcodes and free-text notes.
 *
 * A short numeric code has a small keyspace, so this route leans hard on the
 * throttles below rather than on the code's strength.
 */
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import { query } from '../../db.js';
import { json, requireMethod, requireSameOrigin, readJson, ipHash, str } from '../../http.js';
import { issueSession } from '../../session.js';
import { countHits, recordHit, clearHits, pruneRateHits, LIMITS } from '../../ratelimit.js';
import { deviceFor } from '../../attribution.js';
import { siteFor } from '../../site.js';

export const config = { runtime: 'nodejs' };

const GENERIC_ERROR = 'That code was not recognised.';
const MIN_CODE_LENGTH = 4;

/**
 * Per-IP is not enough on its own here. Five tries per IP still lets a pool of
 * addresses walk a four digit keyspace in hours, so failures are also counted
 * across every address. The global ceiling is set high enough that one person
 * mistyping cannot reach it.
 */
const GLOBAL_BUCKET = { bucket: 'login_global', ipHash: 'all' };
const GLOBAL_LIMIT = 50;

/** Constant-time comparison. Both sides are hashed first so lengths always match. */
function codeMatches(submitted, expected) {
  const a = createHash('sha256').update(String(submitted)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

async function logAttempt(type, req, detail = {}) {
  try {
    await query(
      `insert into events (session_id, type, detail, path, channel, device, ip_hash, site)
       values ($1::uuid, $2, $3::jsonb, '/staff', 'direct', $4, $5, $6)`,
      [randomUUID(), type, JSON.stringify(detail), deviceFor(req.headers['user-agent']), ipHash(req), siteFor(req)]
    );
  } catch (err) {
    console.warn(`could not record ${type}:`, err.message);
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const expected = process.env.STAFF_ACCESS_CODE || '';

  // Fail closed. Without this an unset variable would let an empty submission
  // compare equal to an empty expected value, which is an outright auth bypass.
  if (expected.length < MIN_CODE_LENGTH) {
    console.error('STAFF_ACCESS_CODE is unset or shorter than 4 characters, refusing all logins');
    json(res, 503, { ok: false, error: 'Sign in is not configured.' });
    return;
  }

  const hash = ipHash(req);
  const perIp = { bucket: LIMITS.login.bucket, ipHash: hash };

  // Fails closed: the throttle counters live in the database, and without them
  // there is no way to bound guessing.
  let failures;
  let globalFailures;
  try {
    [failures, globalFailures] = await Promise.all([
      countHits({ ...perIp, windowSeconds: LIMITS.login.windowSeconds }),
      countHits({ ...GLOBAL_BUCKET, windowSeconds: LIMITS.login.windowSeconds })
    ]);
  } catch (err) {
    console.error('login throttle check failed:', err.message);
    json(res, 503, { ok: false, error: 'Sign in is temporarily unavailable.' });
    return;
  }

  if (failures >= LIMITS.login.limit || globalFailures >= GLOBAL_LIMIT) {
    res.setHeader('Retry-After', String(LIMITS.login.windowSeconds));
    json(res, 429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    return;
  }
  pruneRateHits();

  const body = await readJson(req);
  const submitted = str(body.code, 64) || '';

  /* The shared code first, unchanged: it is what the damp staff area has
     always used and it keeps working until that screen is retired. */
  if (submitted && codeMatches(submitted, expected)) {
    await Promise.all([clearHits(perIp), clearHits(GLOBAL_BUCKET)]);
    await logAttempt('staff_login', req, { role: 'admin' });
    issueSession(res, { id: 0, email: null, name: 'Staff', role: 'admin' });
    json(res, 200, { ok: true });
    return;
  }

  /* Then the people. The passcode is the identity, so every active hash is
     checked and every one is checked even after a match: stopping early would
     let the response time say which person was found. Four people is four
     argon2 verifications, which is a fraction of a second and the right price. */
  const person = submitted ? await personFor(submitted) : null;
  if (!person) {
    await Promise.all([recordHit(perIp), recordHit(GLOBAL_BUCKET)]);
    await logAttempt('staff_login_failed', req);
    json(res, 401, { ok: false, error: GENERIC_ERROR });
    return;
  }

  await Promise.all([
    clearHits(perIp),
    clearHits(GLOBAL_BUCKET),
    query('update people set last_login_at = now() where id = $1', [person.id])
  ]);
  await logAttempt('staff_login', req, { person: Number(person.id) });

  issueSession(res, { id: Number(person.id), email: null, name: person.name, role: person.is_admin ? 'admin' : 'staff', person: true });
  json(res, 200, { ok: true });
}

async function personFor(passcode) {
  const people = await query('select id, name, is_admin, passcode_hash from people where active order by id');
  let found = null;
  for (const p of people) {
    let ok = false;
    try { ok = await verify(p.passcode_hash, passcode); } catch { ok = false; }
    if (ok && !found) found = p;
  }
  return found;
}
