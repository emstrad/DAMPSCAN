/**
 * GET /api/admin/summary?range=today|7d|30d|all
 * Every dashboard metric except the leads table. Auth required.
 */
import { json, requireMethod } from '../../http.js';
import { requireScope, sitesFor } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { summary } from '../../metrics.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;

  const params = new URL(req.url, `https://${req.headers.host}`).searchParams;

  /* The filter is applied as the list the scope allows, but the response
     reports what was asked for: one business, or null for all. That is the
     contract the pills read, and it was the contract before scoping existed. */
  const requested = normaliseSite(params.get('site'));
  const shown = requested && scope.businesses.includes(requested) ? requested : null;

  try {
    const data = await summary(params.get('range'), sitesFor(scope, requested));
    json(res, 200, {
      ok: true,
      viewer: { name: scope.name, isAdmin: scope.isAdmin, businesses: scope.businesses },
      ...data,
      site: shown
    });
  } catch (err) {
    console.error('summary failed:', err.message);
    json(res, 500, { ok: false, error: 'summary_failed' });
  }
}
