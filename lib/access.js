/**
 * Who is asking, and which businesses they may see.
 *
 * Every staff route used to take a free ?site= filter and a single shared
 * login, which was fine for two damp brands run by the same people and is
 * wrong for four businesses with different owners. A scope is computed once
 * per request from the session and every list query filters on it, in SQL,
 * so a person granted roofing only cannot reach a damp row by editing a URL.
 *
 * Two kinds of session arrive here. The shared STAFF_ACCESS_CODE login, which
 * the damp staff area has always used, is the owners' code and is an admin
 * over every active business: it must keep working unchanged until that
 * screen is retired. A person's session carries their id, and their scope is
 * read from grants on every request rather than cached in the cookie, so
 * deactivating somebody or changing a grant takes effect on their next click.
 */
import { query, queryOne } from './db.js';
import { json } from './http.js';
import { readSession } from './session.js';

export async function scopeFor(session) {
  if (!session) return null;

  /* The shared code is the owners' login and they run every business, so it
     is an admin over all of them. Read from the table rather than listed here,
     so a fifth business appears in that staff area the day its row exists. */
  if (!session.person) {
    const all = await query('select slug from businesses where active order by slug');
    return { personId: null, name: session.name || 'Staff', isAdmin: true, businesses: all.map((r) => r.slug), levels: {} };
  }

  const person = await queryOne('select id, name, is_admin, active from people where id = $1', [session.sub]);
  if (!person || !person.active) return null;

  const rows = await query('select business_slug, level from grants where person_id = $1', [person.id]);
  const levels = Object.fromEntries(rows.map((r) => [r.business_slug, r.level]));
  return {
    personId: Number(person.id),
    name: person.name,
    isAdmin: Boolean(person.is_admin),
    businesses: rows.map((r) => r.business_slug),
    levels
  };
}

/**
 * The businesses a request may list: the whole scope, or the one it asked for
 * if that is inside the scope. Asking for one outside it yields an empty list
 * rather than an error, because the answer to "show me a business you are not
 * allowed to see" is nothing, not a hint that it exists.
 */
export function sitesFor(scope, requested) {
  if (!requested) return scope.businesses;
  return scope.businesses.includes(requested) ? [requested] : [];
}

/**
 * Guard for every /api/admin/* route. Sends 401 with no session, 403 for a
 * person who has been deactivated or holds no grants at all, and otherwise
 * returns the scope. An empty result and no permission must not look alike,
 * so the second case is refused rather than shown an empty page.
 */
export async function requireScope(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { ok: false, error: 'unauthorised' });
    return null;
  }
  const scope = await scopeFor(session);
  if (!scope || (!scope.isAdmin && !scope.businesses.length)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return null;
  }
  return scope;
}

/** Bank, rates and settings are money configuration: admin only. */
export function requireAdmin(scope, res) {
  if (scope.isAdmin) return true;
  json(res, 403, { ok: false, error: 'forbidden' });
  return false;
}
