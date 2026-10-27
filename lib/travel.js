/**
 * Travel time between surveys, so nothing is booked inside the drive from one
 * job to the next. Postcodes become places through postcodes.io (free, no
 * key), kept in postcode_geo so each is looked up once. The drive is the
 * straight line stretched for roads, at London speed inside London and
 * country speed outside, plus time to park, rounded up to five minutes.
 * When either place is unknown the old rule stands: an hour each side.
 */
import { query } from './db.js';

export const SURVEY_MIN = 60;
export const FALLBACK_MIN = 60;
const ROAD = 1.35;
const PARK_MIN = 10;
const tidy = (p) => String(p || '').toUpperCase().replace(/\s+/g, '');
const inLondon = (g) => g.lat > 51.28 && g.lat < 51.70 && g.lon > -0.51 && g.lon < 0.33;

async function lookUp(missing, fetchImpl) {
  /* Tests never call out; they put places in postcode_geo themselves. */
  if (!missing.length || process.env.NODE_TEST_CONTEXT) return [];
  try {
    const r = await fetchImpl('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: missing.slice(0, 100) }), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.result || []).map((x) => ({ postcode: tidy(x.query), lat: x.result ? x.result.latitude : null, lon: x.result ? x.result.longitude : null }));
  } catch { return []; }
}

/** Places for these postcodes, as a Map of tidy postcode to {lat, lon}. */
export async function places(postcodes, { fetchImpl = fetch } = {}) {
  const want = [...new Set(postcodes.map(tidy).filter((p) => p.length >= 5))];
  const out = new Map();
  if (!want.length) return out;
  const rows = await query('select postcode, lat, lon from postcode_geo where postcode = any($1::text[])', [want]);
  for (const r of rows) if (r.lat != null) out.set(r.postcode, { lat: Number(r.lat), lon: Number(r.lon) });
  const missing = want.filter((p) => !rows.some((r) => r.postcode === p));
  for (const g of await lookUp(missing, fetchImpl)) {
    await query('insert into postcode_geo (postcode, lat, lon) values ($1, $2, $3) on conflict (postcode) do update set lat = $2, lon = $3, looked_at = now()', [g.postcode, g.lat, g.lon]);
    if (g.lat != null) out.set(g.postcode, { lat: g.lat, lon: g.lon });
  }
  return out;
}

/** Minutes to drive from a to b ({lat, lon}), or the fallback when unknown. */
export function driveMinutes(a, b) {
  if (!a || !b) return FALLBACK_MIN;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h)) * ROAD;
  const kmh = inLondon(a) && inLondon(b) ? 18 : inLondon(a) || inLondon(b) ? 28 : 45;
  return Math.ceil((km / kmh * 60 + PARK_MIN) / 5) * 5;
}

const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };

/**
 * Whether a survey at `time` near `postcode` fits round the others that day:
 * [{time, postcode, name, minutes}]. Returns the one it runs into, with the minutes
 * needed, or null. An untimed survey that day blocks the whole day.
 */
export function blocker(time, here, others, where, ownMin = SURVEY_MIN) {
  const t = toMin(time);
  for (const o of others) {
    if (!o.time) return { ...o, why: 'untimed' };
    const ot = toMin(o.time);
    const there = where.get(tidy(o.postcode));
    const drive = here && there ? driveMinutes(here, there) : FALLBACK_MIN;
    /* Each survey takes its own time on site (the rate card's minutes). */
    const ok = ot >= t ? t + ownMin + drive <= ot : ot + (Number(o.minutes) || SURVEY_MIN) + drive <= t;
    if (!ok) return { ...o, drive };
  }
  return null;
}
export { tidy };
