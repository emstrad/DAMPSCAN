/**
 * GET /api/admin/summary?range=today|7d|30d|all
 * Every dashboard metric except the leads table. Auth required.
 */
import { json, requireMethod } from '../../http.js';
import { requireAuth } from '../../session.js';
import { summary } from '../../metrics.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const session = requireAuth(req, res);
  if (!session) return;

  const params = new URL(req.url, `https://${req.headers.host}`).searchParams;

  try {
    const data = await summary(params.get('range'), params.get('site'));
    json(res, 200, { ok: true, viewer: { email: session.email, name: session.name }, ...data });
  } catch (err) {
    console.error('summary failed:', err.message);
    json(res, 500, { ok: false, error: 'summary_failed' });
  }
}
