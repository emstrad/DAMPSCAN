/**
 * POST /api/auth/logout
 * Clears the session cookie. Safe to call when already signed out.
 */
import { json, requireMethod, requireSameOrigin } from '../../http.js';
import { clearSession } from '../../session.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;
  clearSession(res);
  json(res, 200, { ok: true });
}
