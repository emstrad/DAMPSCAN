/**
 * /api/auth/login and /api/auth/logout, as one serverless function.
 *
 * Same reason as api/admin/[action].js: a file under api/ is a function, and
 * the deployment has a ceiling on how many of those it may have. The URLs are
 * unchanged, the handlers are unchanged, they just live under lib/routes/auth/
 * so Vercel stops counting them separately.
 */
import { json, requireMethod, actionFrom } from '../../lib/http.js';
import login from '../../lib/routes/auth/login.js';
import logout from '../../lib/routes/auth/logout.js';

export const config = { runtime: 'nodejs' };

const ROUTES = { login, logout };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  const route = ROUTES[actionFrom(req.url)];
  if (!route) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  return route(req, res);
}
