/**
 * /api/admin/push
 *
 *   GET                       {ok, publicKey, phones}  publicKey is null when push
 *                             is not set up, which is how the page knows to hide
 *                             the button; phones is who has notifications on, so
 *                             nobody relies on ntfy alone without knowing
 *   POST  {subscription}      keep this browser's subscription for the person
 *   DELETE {endpoint}         forget it
 *
 * The subscription is the browser's, the person is the session's: nothing in
 * the body says who it is for, so nobody can sign somebody else up. What each
 * person is then told about is decided at send time from their grants, in
 * lib/push.js.
 */
import { json, requireMethod, readJson } from '../../http.js';
import { requireScope } from '../../access.js';
import { query } from '../../db.js';
import { vapidConfig } from '../../webpush.js';
import { saveSubscription, removeSubscription } from '../../push.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const vapid = vapidConfig();
  if (req.method === 'GET') {
    const phones = await query(`select coalesce(p.name, 'Owners'' code') as name, count(*)::int as phones from push_subscriptions s left join people p on p.id = s.person_id
        where s.person_id is null or exists (select 1 from grants g where g.person_id = p.id and g.business_slug = any($1::text[]))
        group by 1 order by 1`, [scope.businesses]).catch(() => []);
    return json(res, 200, { ok: true, publicKey: vapid ? vapid.publicKey : null, phones });
  }
  if (!vapid) return json(res, 404, { ok: false, error: 'not_configured' });
  try {
    const body = await readJson(req);
    if (req.method === 'DELETE') {
      await removeSubscription(scope, body.endpoint);
      return json(res, 200, { ok: true });
    }
    if (!(await saveSubscription(scope, body.subscription))) return json(res, 400, { ok: false, error: 'bad_subscription' });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('push request failed:', err.message);
    return json(res, 500, { ok: false, error: 'push_failed' });
  }
}
