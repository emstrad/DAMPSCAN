/**
 * POST /api/event
 *
 * First-party, cookieless interaction log. Answers 204 as fast as it can and
 * swallows every error: analytics must never slow the page down or break it.
 */
import { query } from '../lib/db.js';
import { requireMethod, requireSameOrigin, readJson, ipHash, str, json } from '../lib/http.js';
import { sanitiseUtm } from '../lib/validate.js';
import { channelFor, deviceFor } from '../lib/attribution.js';
import { rateLimit, pruneRateHits, LIMITS } from '../lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

/** Closed set. An unrecognised type is rejected rather than stored. */
const TYPES = new Set([
  'page_view', 'call_click', 'form_open', 'form_step', 'form_submit',
  'form_error', 'email_click', 'cta_click'
]);

/** Everything else in `detail` is dropped, so the column cannot be used as free storage. */
const DETAIL_KEYS = ['step', 'placement', 'issue_count', 'role', 'field', 'duration_ms'];
const DETAIL_MAX_BYTES = 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitiseDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const out = {};
  for (const key of DETAIL_KEYS) {
    const raw = detail[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'boolean') out[key] = raw;
    else {
      const clean = String(raw).trim().slice(0, 120);
      if (clean) out[key] = clean;
    }
  }
  let encoded = JSON.stringify(out);
  while (Buffer.byteLength(encoded) > DETAIL_MAX_BYTES) {
    const keys = Object.keys(out);
    if (!keys.length) break;
    delete out[keys[keys.length - 1]];
    encoded = JSON.stringify(out);
  }
  return out;
}

const INSERT = `
  insert into events (
    session_id, type, detail, path, referrer, channel, utm, landing_page, device, ip_hash
  ) values ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8, $9, $10)`;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const done = () => {
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end();
  };

  try {
    const hash = ipHash(req);
    const limit = await rateLimit({ ...LIMITS.event, ipHash: hash });
    if (!limit.ok) {
      res.setHeader('Retry-After', String(LIMITS.event.windowSeconds));
      json(res, 429, { ok: false, error: 'too_many_requests' });
      return;
    }
    pruneRateHits();

    const body = await readJson(req);
    const sessionId = String(body.sessionId || '').trim();
    const type = String(body.type || '').trim();

    if (!UUID_RE.test(sessionId) || !TYPES.has(type)) {
      json(res, 400, { ok: false, error: 'bad_event' });
      return;
    }

    const utm = sanitiseUtm(body.utm);
    const referrer = str(body.referrer, 500);

    await query(INSERT, [
      sessionId,
      type,
      JSON.stringify(sanitiseDetail(body.detail)),
      str(body.path, 300),
      referrer,
      channelFor({ utm, referrer }),
      JSON.stringify(utm),
      str(body.landingPage, 300),
      deviceFor(req.headers['user-agent']),
      hash
    ]);

    done();
  } catch (err) {
    // A dropped analytics event is never worth showing the visitor an error.
    console.warn('event write failed:', err.message);
    if (!res.writableEnded) done();
  }
}
