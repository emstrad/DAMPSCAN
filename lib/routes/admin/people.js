/**
 * GET /api/admin/people?site=
 *
 * The people who hold a grant on a business the viewer may see, so the quoted
 * job screen can offer them as the finder and, for roofing, as the owners
 * whose days go on the job. With ?site= it is that business's people; without
 * it, everyone across the viewer's scope, each with the businesses they hold.
 *
 * Names and grants only. Nothing about how anybody signs in leaves the table,
 * and a business outside the viewer's scope yields an empty list rather than
 * a hint that it has people.
 */
import { json, requireMethod } from '../../http.js';
import { requireScope, sitesFor } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { query } from '../../db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;

  const url = new URL(req.url, 'http://localhost');
  const sites = sitesFor(scope, normaliseSite(url.searchParams.get('site')));
  const rows = await query(
    `select p.id, p.name, p.is_admin, g.business_slug, g.level
       from people p join grants g on g.person_id = p.id
      where p.active and g.business_slug = any($1::text[])
      order by p.name, p.id, g.business_slug`,
    [sites]
  );

  const people = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    if (!people.has(id)) people.set(id, { id, name: r.name, isAdmin: Boolean(r.is_admin), businesses: [] });
    people.get(id).businesses.push({ slug: r.business_slug, level: r.level });
  }
  json(res, 200, { ok: true, people: [...people.values()] });
}
