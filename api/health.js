/**
 * GET /api/health
 * Uptime check. Answers 200 with { ok: true, db: <boolean> } whenever the
 * function itself is alive, so a monitor can tell "site down" apart from
 * "database down".
 */
import { ping } from '../lib/db.js';
import { json, requireMethod } from '../lib/http.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  json(res, 200, { ok: true, db: await ping() });
}
