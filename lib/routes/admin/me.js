/**
 * GET /api/admin/me
 *
 * Who is signed in and what they may see, so the staff pages can build their
 * business pills from grants rather than from a hardcoded list. A business
 * nobody granted you is absent from the page, not greyed out: the server
 * filters regardless, this is presentation.
 */
import { json, requireMethod } from '../../http.js';
import { requireScope } from '../../access.js';
import { query } from '../../db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;

  const rows = await query(
    'select slug, name, payout_model, day_rate_pence from businesses where active and slug = any($1::text[]) order by slug',
    [scope.businesses]
  );
  json(res, 200, {
    ok: true,
    name: scope.name,
    personId: scope.personId,
    isAdmin: scope.isAdmin,
    legacy: scope.personId === null,
    businesses: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      payoutModel: r.payout_model,
      level: scope.levels[r.slug] || (scope.isAdmin ? 'manage' : 'view'),
      dayRatePence: Number(r.day_rate_pence)
    }))
  });
}
