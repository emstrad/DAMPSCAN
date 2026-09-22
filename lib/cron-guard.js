/**
 * The door on every /api/cron/* route.
 *
 * Vercel calls a cron with `Authorization: Bearer $CRON_SECRET`, and that
 * header is the only thing that gets past. With no secret configured the
 * route refuses everyone, including Vercel, rather than run a job on an open
 * URL. Compared in constant time, because a secret is a secret.
 */
import { timingSafeEqual } from 'node:crypto';
import { json } from './http.js';

export function authorised(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (secret.length < 16) return false;
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sends the refusal and returns false, or returns true to carry on. */
export function requireCron(req, res) {
  if (!(process.env.CRON_SECRET || '').trim()) {
    json(res, 503, { ok: false, error: 'cron_secret_not_set' });
    return false;
  }
  if (!authorised(req)) {
    json(res, 401, { ok: false, error: 'unauthorised' });
    return false;
  }
  return true;
}
