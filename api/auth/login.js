/**
 * POST /api/auth/login
 *
 * Unknown email and wrong password return the same message after doing the same
 * amount of work, so the response cannot be used to enumerate accounts.
 */
import { randomUUID } from 'node:crypto';
import { verify, Algorithm } from '@node-rs/argon2';
import { query, queryOne } from '../../lib/db.js';
import { json, requireMethod, requireSameOrigin, readJson, ipHash, str } from '../../lib/http.js';
import { issueSession } from '../../lib/session.js';
import { countHits, recordHit, clearHits, pruneRateHits, LIMITS } from '../../lib/ratelimit.js';
import { deviceFor } from '../../lib/attribution.js';

export const config = { runtime: 'nodejs' };

const GENERIC_ERROR = 'Those details were not recognised.';

/**
 * A real argon2id hash of a random string nobody knows. When the email does not
 * exist we verify against this instead of returning early, so both paths cost
 * the same. Never a usable credential: no plaintext for it exists.
 */
const DECOY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$sukMhoU6OwO8DRt9hDawGA$Zxgm8/DRwkbzL73l0yqQGwJFPBl1foOggzqgJ3tX+0s';

async function logAttempt(type, req, detail = {}) {
  try {
    await query(
      `insert into events (session_id, type, detail, path, channel, device, ip_hash)
       values ($1::uuid, $2, $3::jsonb, '/staff', 'direct', $4, $5)`,
      [randomUUID(), type, JSON.stringify(detail), deviceFor(req.headers['user-agent']), ipHash(req)]
    );
  } catch (err) {
    console.warn(`could not record ${type}:`, err.message);
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const hash = ipHash(req);
  const bucket = { bucket: LIMITS.login.bucket, ipHash: hash };

  // Fails closed. Without the database there is no password to check anyway.
  let failures;
  try {
    failures = await countHits({ ...bucket, windowSeconds: LIMITS.login.windowSeconds });
  } catch (err) {
    console.error('login throttle check failed:', err.message);
    json(res, 503, { ok: false, error: 'Sign in is temporarily unavailable.' });
    return;
  }

  if (failures >= LIMITS.login.limit) {
    res.setHeader('Retry-After', String(LIMITS.login.windowSeconds));
    json(res, 429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    return;
  }
  pruneRateHits();

  const body = await readJson(req);
  const email = (str(body.email, 254) || '').toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const reject = async () => {
    await recordHit(bucket);
    await logAttempt('staff_login_failed', req);
    json(res, 401, { ok: false, error: GENERIC_ERROR });
  };

  if (!email || !password) {
    await reject();
    return;
  }

  let user = null;
  try {
    user = await queryOne(
      `select id, email, name, role, password_hash, disabled
         from staff_users where lower(email) = $1`,
      [email]
    );
  } catch (err) {
    console.error('login lookup failed:', err.message);
    json(res, 503, { ok: false, error: 'Sign in is temporarily unavailable.' });
    return;
  }

  // A disabled account behaves exactly like a missing one, including the work done.
  const usable = user && !user.disabled;
  let passwordOk = false;
  try {
    passwordOk = await verify(usable ? user.password_hash : DECOY_HASH, password, {
      algorithm: Algorithm.Argon2id
    });
  } catch (err) {
    console.warn('password verification error:', err.message);
    passwordOk = false;
  }

  if (!usable || !passwordOk) {
    await reject();
    return;
  }

  try {
    await query('update staff_users set last_login_at = now() where id = $1', [user.id]);
  } catch (err) {
    console.warn('could not stamp last_login_at:', err.message);
  }
  await clearHits(bucket);
  await logAttempt('staff_login', req, { role: user.role });

  issueSession(res, user);
  json(res, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } });
}
