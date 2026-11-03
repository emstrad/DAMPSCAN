/**
 * Phone notifications to the installed staff app, through Web Push.
 *
 * A member of staff taps "Turn on notifications" in the staff area; their
 * browser hands back a subscription, which is kept against them here. When
 * something worth a buzz happens (a new enquiry, a quote accepted online, a
 * rating), everyone subscribed who holds that business is told. Holding is
 * read from grants at send time, so a grant taken away stops the pushes at
 * once without anybody touching the subscriptions. The shared owners' login
 * has no person, so its subscriptions carry none and hear about everything,
 * the same as what it sees.
 *
 * The same rule as lib/notify.js: a push sits on a lock screen, so it may
 * name a business, an amount and the customer as "Sarah, BR6", never more.
 *
 * Without VAPID keys in the environment this does nothing at all, and the
 * staff area hides the button.
 */
import { query } from './db.js';
import { vapidConfig, sendPush } from './webpush.js';

/* The notification kinds that buzz a phone. Everything else waits for the
   morning digest or the screen. */
export const PUSH_KINDS = new Set(['enquiry', 'quote_accepted', 'rating', 'rating_low']);

/** Keeps a subscription for this scope's person. Returns false when it is not a usable one. */
export async function saveSubscription(scope, sub) {
  const endpoint = sub && typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const keys = sub && sub.keys && typeof sub.keys === 'object' ? { p256dh: String(sub.keys.p256dh || ''), auth: String(sub.keys.auth || '') } : null;
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint) || !keys || !/^[\w-]{80,100}$/.test(keys.p256dh) || !/^[\w-]{16,32}$/.test(keys.auth)) return false;
  /* An endpoint belongs to one browser. If somebody else signs in on the same
     phone, it moves to them rather than telling both. */
  await query(
    `insert into push_subscriptions (person_id, endpoint, keys) values ($1, $2, $3)
     on conflict (endpoint) do update set person_id = excluded.person_id, keys = excluded.keys, created_at = now()`,
    [scope.personId, endpoint, JSON.stringify(keys)]);
  return true;
}

export async function removeSubscription(scope, endpoint) {
  await query('delete from push_subscriptions where endpoint = $1 and person_id is not distinct from $2', [String(endpoint || ''), scope.personId]);
}

/** The subscriptions that may hear about this business. */
/* Owners who chose to hear only their own diary, not every owners' alert
   (Ben, as his ntfy feed was): first names, comma separated. */
const diaryOnly = () => String(process.env.APP_DIARY_ONLY ?? 'ben').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

/* The owners' alerts reach the owners' code and the managers of that business
   (any business, for one that is not about a business). A work-level person
   such as Ronnie never hears them, only their own diary (pushToSurveyor). */
async function recipients(business) {
  return query(
    `select s.id, s.endpoint, s.keys from push_subscriptions s
      where s.person_id is null
         or exists (
              select 1 from people p join grants g on g.person_id = p.id
               where p.id = s.person_id and p.active and g.level = 'manage'
                 and ($1::text is null or g.business_slug = $1)
                 and not (lower(split_part(trim(p.name), ' ', 1)) = any($2::text[])))`,
    [business || null, diaryOnly()]);
}

/** A surveyor's own diary alert, to whoever signs in under that first name. */
export async function pushToSurveyor(surveyor, note) {
  if (!vapidConfig() || !surveyor) return { sent: 0, removed: 0 };
  try {
    return sendTo(await query(`select s.id, s.endpoint, s.keys from push_subscriptions s join people p on p.id = s.person_id
        where p.active and lower(split_part(trim(p.name), ' ', 1)) = $1`, [String(surveyor).toLowerCase()]), note);
  } catch (err) {
    console.warn('push to surveyor failed:', err.message);
    return { sent: 0, removed: 0 };
  }
}

export async function pushToPerson(personId, note) {
  if (!vapidConfig()) return { sent: 0, removed: 0 };
  try { return sendTo(await query('select id, endpoint, keys from push_subscriptions where person_id = $1', [personId]), note); } catch (err) {
    console.warn('push to person failed:', err.message);
    return { sent: 0, removed: 0 };
  }
}

/**
 * Pushes one notification to everyone who holds the business. Never throws,
 * and does nothing without keys. Subscriptions the push service has
 * forgotten (404, 410) are forgotten here too.
 */
export async function pushToStaff({ business, ...note }) {
  if (!vapidConfig()) return { sent: 0, removed: 0 };
  let subs;
  try { subs = await recipients(business); } catch (err) { console.warn('push to staff failed:', err.message); return { sent: 0, removed: 0 }; }
  return sendTo(subs, note);
}

async function sendTo(subs, { title, message, url = '/staff/calendar.html', tag }) {
  const config = vapidConfig();
  if (!config) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  try {
    const payload = { title, body: message, url, tag: tag || undefined };
    await Promise.all(subs.map(async (s) => {
      const keys = typeof s.keys === 'string' ? JSON.parse(s.keys) : s.keys;
      const r = await sendPush({ endpoint: s.endpoint, keys }, payload, config);
      if (r.ok) sent++;
      if (r.gone) {
        await query('delete from push_subscriptions where id = $1', [s.id]);
        removed++;
      }
    }));
  } catch (err) {
    console.warn('push to staff failed:', err.message);
  }
  return { sent, removed };
}
