/**
 * /api/admin/push
 *
 *   GET                       {ok, publicKey, phones}  publicKey is null when push
 *                             is not set up, which is how the page knows to hide
 *                             the button; phones is who has notifications on, so
 *                             nobody relies on ntfy alone without knowing
 *   POST  {subscription}      keep this browser's subscription for the person
 *   DELETE {endpoint}         forget it
 *   POST ?test=1              send a test alert to ntfy and the staff app
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
import { saveSubscription, removeSubscription, pushToStaff } from '../../push.js';
import { push } from '../../notify.js';

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
    /* The last enquiry alerts and whether ntfy took each, so a silent phone can be told apart from a refused push. */
    const recent = await query(`select title, created_at as at, push_sent_at is not null as sent, push_error as error from notifications
        where kind = 'enquiry' and business_slug = any($1::text[]) order by id desc limit 5`, [scope.businesses]).catch(() => []);
    return json(res, 200, { ok: true, publicKey: vapid ? vapid.publicKey : null, phones, ntfy: Boolean((process.env.NTFY_TOPIC || '').trim()), recent });
  }
  if (req.method === 'POST' && req.query && req.query.test) {
    /* A test goes to the owners' ntfy topic and every phone: managers only. */
    const manages = scope.isAdmin || (scope.businesses || []).some((b) => (scope.levels || {})[b] === 'manage');
    if (!manages) return json(res, 403, { ok: false, error: 'forbidden' });
    const ntfy = await push({ title: 'Test alert', message: 'If this is on your phone, ntfy alerts are working.', tags: 'white_check_mark' });
    const why = ntfy ? null : push.lastError || null;
    const app = await pushToStaff({ business: scope.businesses[0], title: 'Test alert', message: 'If this is on your phone, staff app alerts are working.', tag: 'test' });
    return json(res, 200, { ok: true, ntfy, why, app: app.sent });
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
