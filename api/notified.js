/**
 * POST /api/notified
 *
 * Records whether the browser managed to send the FormSubmit notification for a
 * lead. FormSubmit sits behind Cloudflare and refuses server-to-server calls, so
 * the email is sent from the page and the outcome is reported back here. Without
 * this the dashboard would show every lead as "Pending" forever.
 *
 * This only ever stamps notified_at or notify_error. It cannot create, alter or
 * read lead data, so a caller who guesses a session id learns nothing and can
 * change nothing that matters.
 */
import { query } from '../lib/db.js';
import { requireMethod, requireSameOrigin, readJson, ipHash, str, json } from '../lib/http.js';
import { rateLimit, LIMITS } from '../lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const done = () => {
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end();
  };

  try {
    const limit = await rateLimit({ ...LIMITS.event, ipHash: ipHash(req) });
    if (!limit.ok) {
      json(res, 429, { ok: false, error: 'too_many_requests' });
      return;
    }

    const body = await readJson(req);
    const sessionId = String(body.sessionId || '').trim();
    const stage = body.stage === 'partial' || body.stage === 'complete' ? body.stage : null;

    if (!UUID_RE.test(sessionId) || !stage) {
      json(res, 400, { ok: false, error: 'bad_request' });
      return;
    }

    if (body.ok === true) {
      await query(
        `update leads set notified_at = now(), notify_error = null
          where session_id = $1::uuid and stage = $2`,
        [sessionId, stage]
      );
    } else {
      await query(
        `update leads set notify_error = $3 where session_id = $1::uuid and stage = $2`,
        [sessionId, stage, str(body.error, 500) || 'The browser could not reach FormSubmit.']
      );
    }

    done();
  } catch (err) {
    // Never let notification bookkeeping surface an error to the visitor.
    console.warn('notify bookkeeping failed:', err.message);
    if (!res.writableEnded) done();
  }
}
