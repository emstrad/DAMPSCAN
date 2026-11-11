/**
 * The audit trail of a customer's page (the owners' choice, 11 Nov 2026):
 * what they opened, tried and downloaded, so the team can see it before a
 * chase call. A hashed IP and a rough device only, never a raw address.
 */
import { query, queryOne } from './db.js';

/* Opening the page is noted once per ten minutes, not on every refresh. */
const QUIET = { opened: '10 minutes' };

export function deviceOf(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  return /iphone|ipad/i.test(ua) ? 'iPhone or iPad' : /android/i.test(ua) ? 'Android' : /macintosh|windows|linux/i.test(ua) ? 'Computer' : 'Unknown';
}

export async function logEvent(jobId, kind, { detail = null, ipHash = null, device = null } = {}) {
  if (QUIET[kind]) {
    const recent = await queryOne(`select 1 from portal_events where job_id = $1 and kind = $2 and at > now() - $3::interval`, [jobId, kind, QUIET[kind]]);
    if (recent) return false;
  }
  await query('insert into portal_events (job_id, kind, detail, ip_hash, device) values ($1, $2, $3, $4, $5)', [jobId, kind, detail, ipHash, device]);
  return true;
}

/** Recent failed postcode tries on this survey, for the download lock. */
export async function recentFails(jobId, minutes = 30) {
  const r = await queryOne(`select count(*)::int as n from portal_events where job_id = $1 and kind = 'postcode_fail' and at > now() - make_interval(mins => $2)`, [jobId, minutes]);
  return r ? r.n : 0;
}

const WORDS = { opened: 'Opened their page', postcode_fail: 'Typed a wrong postcode to download the report', report: 'Downloaded the report',
  newlink: 'Asked for a new link', message: 'Sent a message', move: 'Asked to move the survey', photos: 'Added photos', locked: 'Report downloads locked after 5 wrong postcodes', photo: 'Viewed their photos' };

/** The trail for the customer card: newest first, in plain words. */
export async function eventsFor(jobId, limit = 40) {
  const rows = await query('select kind, detail, device, at from portal_events where job_id = $1 order by at desc limit $2', [jobId, limit]);
  return rows.map((r) => ({ at: r.at, kind: r.kind, what: WORDS[r.kind] || r.kind, device: r.device, detail: r.detail }));
}

/** "Opened 3 times, last 10 min ago", for the job card. */
export async function openedSummary(jobId) {
  const r = await queryOne(`select count(*)::int as n, max(at) as last from portal_events where job_id = $1 and kind = 'opened'`, [jobId]);
  return r && r.n ? { times: r.n, last: r.last } : null;
}
