/**
 * Real drive times by road (the timings audit, 13 Nov 2026). The old guess
 * (straight line stretched, a flat speed) ran two to three times too long:
 * Gravesend to Hythe came out at 125 minutes against 55 on the road, Sidcup
 * to Maidstone 115 against 35, so sensible times were refused while the
 * survey-length bug let real clashes through.
 *
 * Road times come from OSRM's table service (free-flow, no traffic), for
 * every pair of places in play at once, kept in drive_times so each pair is
 * asked for once. A traffic allowance goes on top (more in London), plus time
 * to park, in lib/travel.js. OSRM_URL points at another OSRM server (the
 * public demo is the default); with none reachable, the tuned estimate in
 * lib/travel.js stands in, so a booking is never held up by the lookup.
 */
import { query } from './db.js';

const BASE = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
const CHUNK = 40;
const TIMEOUT_MS = 4000;
/* Free-flow minutes by "lat,lon|lat,lon", for this instance. */
const MEMO = new Map();
export const keyOf = (g) => `${Number(g.lat).toFixed(4)},${Number(g.lon).toFixed(4)}`;
export const memo = MEMO;

/** The free-flow road minutes from a to b, if known, else null. */
export function roadMinutes(a, b) {
  if (!a || !b) return null;
  const v = MEMO.get(`${keyOf(a)}|${keyOf(b)}`);
  return v == null ? null : v;
}

async function table(points, fetchImpl) {
  const coords = points.map((p) => `${Number(p.lon).toFixed(5)},${Number(p.lat).toFixed(5)}`).join(';');
  const r = await fetchImpl(`${BASE()}/table/v1/driving/${coords}?annotations=duration`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`OSRM said ${r.status}`);
  const d = await r.json();
  if (d.code !== 'Ok' || !Array.isArray(d.durations)) throw new Error(`OSRM: ${d.code}`);
  return d.durations;
}

/**
 * Makes sure every pair among these places has a road time: from memory,
 * then the database, then OSRM (in blocks), saving what it learns. Never
 * throws: a pair it cannot get falls back to the estimate.
 */
export async function learnRoads(points, { fetchImpl = fetch } = {}) {
  const uniq = [...new Map(points.filter(Boolean).map((p) => [keyOf(p), p])).values()];
  if (uniq.length < 2) return;
  const want = [];
  for (const a of uniq) for (const b of uniq) if (a !== b && !MEMO.has(`${keyOf(a)}|${keyOf(b)}`)) want.push(`${keyOf(a)}|${keyOf(b)}`);
  if (!want.length) return;
  const known = await query('select pair, minutes from drive_times where pair = any($1::text[])', [want]).catch(() => []);
  for (const r of known) MEMO.set(r.pair, Number(r.minutes));
  if (process.env.NODE_TEST_CONTEXT && !process.env.OSRM_IN_TESTS) return;
  const missingKeys = new Set(want.filter((k) => !MEMO.has(k)).flatMap((k) => k.split('|')));
  const missing = uniq.filter((p) => missingKeys.has(keyOf(p)));
  if (missing.length < 2) return;
  for (let i = 0; i < missing.length; i += CHUNK) {
    for (let j = 0; j < missing.length; j += CHUNK) {
      const block = [...missing.slice(i, i + CHUNK), ...missing.slice(j, j + CHUNK)].filter((p, n, all) => all.findIndex((q) => keyOf(q) === keyOf(p)) === n);
      try {
        const d = await table(block, fetchImpl);
        const rows = [];
        block.forEach((a, x) => block.forEach((b, y) => {
          if (x === y || d[x][y] == null) return;
          const pair = `${keyOf(a)}|${keyOf(b)}`;
          const minutes = Math.round((d[x][y] / 60) * 10) / 10;
          if (!MEMO.has(pair)) { MEMO.set(pair, minutes); rows.push([pair, minutes]); }
        }));
        if (rows.length) {
          await query(`insert into drive_times (pair, minutes) select * from unnest($1::text[], $2::numeric[])
              on conflict (pair) do update set minutes = excluded.minutes, looked_at = now()`, [rows.map((r) => r[0]), rows.map((r) => r[1])]).catch(() => {});
        }
      } catch (err) {
        console.warn('road times unavailable, using the estimate:', err.message);
        return;
      }
    }
  }
}
