/**
 * The websites' own log of what went wrong (the owner, 17 Nov 2026: the
 * Vercel logs sit on another account and keep an hour). Three kinds: the
 * booking form refused by the server (which step, which field: Alex was sent
 * round in a loop by one), an error in a visitor's browser (the script and
 * line), and a customer-facing request that failed on the server. Never a
 * name, email, phone or address: only where, the field and the error's own
 * words. Kept 90 days in site_errors, shown on Growth and in the Monday
 * briefing, and readable straight from the database.
 */
import { query } from './db.js';

export const KINDS = { form_refused: 'Form refused', page_error: 'Page error', server_error: 'Server failure' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cut = (v, n) => (v === undefined || v === null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);
/* An email or phone number typed into an error's words is never kept. */
const scrub = (v) => (v ? v.replace(/[^\s@]+@[^\s@]+/g, '[email]').replace(/\+?\d[\d\s]{8,}\d/g, '[number]') : v);

/** Notes one; never throws, since a log must not break the page it watches. */
export async function logSiteError({ site, kind, path, step, field, message, device, sessionId }) {
  if (!KINDS[kind]) return;
  try {
    await query(`insert into site_errors (site, kind, path, step, field, message, device, session_id) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cut(site, 20), kind, cut(path, 200), Number.isInteger(Number(step)) && step !== null && step !== '' ? Number(step) : null,
        scrub(cut(field, 120)), scrub(cut(message, 240)), cut(device, 20), UUID_RE.test(String(sessionId || '')) ? sessionId : null]);
    if (Math.random() < 0.02) await query("delete from site_errors where at < now() - interval '90 days'");
  } catch (err) { console.warn('site error log failed:', err.message); }
}

/** The last 30 days for Growth: a count of each kind and the latest twenty. */
export async function siteErrors({ sites = ['dampscan', 'ati-london'], days = 30 } = {}) {
  const [counts, latest] = await Promise.all([
    query(`select kind, count(*)::int as n from site_errors where (site is null or site = any($1::text[])) and at > now() - make_interval(days => $2) group by 1`, [sites, days]),
    query(`select at, site, kind, path, step, field, message, device from site_errors
       where (site is null or site = any($1::text[])) and at > now() - make_interval(days => $2) order by at desc limit 20`, [sites, days])
  ]);
  const n = (k) => (counts.find((c) => c.kind === k) || { n: 0 }).n;
  return { days, counts: Object.keys(KINDS).map((k) => ({ kind: k, name: KINDS[k], n: n(k) })), latest: latest.map((r) => ({ ...r, name: KINDS[r.kind] })) };
}

/** How many between two days (London), for the Monday briefing. */
export async function errorsBetween(from, to, sites = ['dampscan', 'ati-london']) {
  const r = await query(`select count(*)::int as n from site_errors where (site is null or site = any($1::text[]))
      and (at at time zone 'Europe/London')::date between $2::date and $3::date`, [sites, from, to]);
  return r[0] ? r[0].n : 0;
}
