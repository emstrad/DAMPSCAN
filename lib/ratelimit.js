/**
 * Simple IP throttle.
 *
 * Serverless instances do not share memory, so an in-process counter would let
 * an attacker walk straight past the limit by spreading requests across cold
 * starts. The counters live in the rate_hits table instead, which every instance
 * can see. One round trip: the insert and the count happen in a single
 * statement, and because a data-modifying CTE cannot see its own write the new
 * row is added back on explicitly.
 */
import { query } from './db.js';

const COUNT_AND_RECORD = `
  with ins as (
    insert into rate_hits (bucket, ip_hash) values ($1, $2) returning 1
  )
  select (
    select count(*) from rate_hits
     where bucket = $1 and ip_hash = $2
       and created_at > now() - make_interval(secs => $3::int)
  ) + (select count(*) from ins) as hits`;

/**
 * Records one hit and reports whether the caller is now over the limit.
 *
 * Fails open: if the database is unreachable the throttle stops working but the
 * booking form keeps taking leads, which is the right trade for this site. The
 * login route treats an unreachable database as a failure anyway, since it
 * cannot verify a password without one.
 */
export async function rateLimit({ bucket, ipHash, limit, windowSeconds }) {
  try {
    const rows = await query(COUNT_AND_RECORD, [bucket, ipHash, windowSeconds]);
    const hits = Number(rows[0]?.hits || 0);
    return { ok: hits <= limit, hits, limit };
  } catch (err) {
    console.warn('rate limit check failed, allowing request:', err.message);
    return { ok: true, hits: 0, limit, degraded: true };
  }
}

const COUNT_ONLY = `
  select count(*) as hits from rate_hits
   where bucket = $1 and ip_hash = $2
     and created_at > now() - make_interval(secs => $3::int)`;

/**
 * Reads the counter without recording anything. Used by the login route, which
 * only wants to count failed attempts, so it has to check before it knows
 * whether this attempt counts. Fails closed: a login cannot be verified without
 * the database anyway, so a read error is treated as being over the limit.
 */
export async function countHits({ bucket, ipHash, windowSeconds }) {
  const rows = await query(COUNT_ONLY, [bucket, ipHash, windowSeconds]);
  return Number(rows[0]?.hits || 0);
}

export async function recordHit({ bucket, ipHash }) {
  try {
    await query('insert into rate_hits (bucket, ip_hash) values ($1, $2)', [bucket, ipHash]);
  } catch (err) {
    console.warn('could not record rate limit hit:', err.message);
  }
}

/** Clears a bucket for one address. Called after a successful login so an earlier typo streak is forgiven. */
export async function clearHits({ bucket, ipHash }) {
  try {
    await query('delete from rate_hits where bucket = $1 and ip_hash = $2', [bucket, ipHash]);
  } catch {
    /* not worth failing a successful login over */
  }
}

/**
 * Drops counters older than the longest window in use. Called opportunistically
 * so the table cannot grow without bound, and never allowed to fail a request.
 */
export async function pruneRateHits(probability = 0.02) {
  if (Math.random() > probability) return;
  try {
    await query(`delete from rate_hits where created_at < now() - interval '1 hour'`);
  } catch {
    /* housekeeping only */
  }
}

export const LIMITS = {
  lead: { bucket: 'lead', limit: 8, windowSeconds: 600 },
  event: { bucket: 'event', limit: 60, windowSeconds: 600 },
  login: { bucket: 'login', limit: 5, windowSeconds: 900 }
};
