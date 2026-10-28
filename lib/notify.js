/**
 * Telling the owner something happened, on a phone, without telling the phone
 * anything about a customer.
 *
 * Every notification is a row first and a push second. The row is what the
 * morning digest reads and what a person can check later; the push is best
 * effort, through ntfy, and a failure to send is logged and never stops the
 * write that caused it. With no topic configured the rows still land and
 * nothing is sent, which is what a test and a fresh deployment both want.
 *
 * The one rule: a title or message may name a business, an amount, a member
 * of staff and the customer's first name and postcode district ("Sarah, BR6",
 * built by lib/alert-words.js), which the owner agreed is enough to know the
 * job by. Never a surname, phone, email, street or full postcode, because a
 * push sits on a lock screen. The one exception is the Call button on a new
 * enquiry, whose tel: link carries the number but is never shown as text.
 *
 * Priority follows ntfy's scale: 4 (high) for a customer waiting on us, 3
 * for the rest, 2 (low) for routine staff activity. `path` is a staff page
 * such as "/quoted.html?area=roofing#job-5", opened by a tap.
 */
import { query, queryOne } from './db.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pushToStaff, PUSH_KINDS } from './push.js';
import { staffBase } from './alert-words.js';
import { currentActor } from './actor.js';

/* Set for the length of one staff request by lib/activity.js. A request that
   already sent its own alert (a payment, a new job) is not announced twice. */
export const requestAlerts = new AsyncLocalStorage();

const TIMEOUT_MS = 4000;

/** Sends one push. True when ntfy accepted it, false when not configured or it failed. */
export async function push({ title, message, tags = 'bell', priority = 3, click, actions, sequence, delay, topic: to }) {
  /* The owners' topic unless a surveyor's own feed is named (lib/surveyor-alerts.js). */
  const topic = (to || process.env.NTFY_TOPIC || '').trim();
  if (!topic) return false;
  const base = (process.env.NTFY_URL || 'https://ntfy.sh').trim().replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  const token = (process.env.NTFY_TOKEN || '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    /* JSON publishing rather than headers, so a pound sign in a title does not
       need encoding to survive an HTTP header. */
    const res = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic, title, message, priority,
        tags: Array.isArray(tags) ? tags : String(tags).split(','),
        ...(click ? { click } : {}),
        ...(actions && actions.length ? { actions } : {}),
        ...(sequence ? { sequence_id: sequence } : {}),
        ...(delay ? { delay } : {})
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    /* Why ntfy said no (a 429 is its daily quota), kept for Settings to show. */
    if (!res.ok) { push.lastError = `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`; console.warn('ntfy refused a push:', push.lastError); }
    return res.ok;
  } catch (err) {
    push.lastError = err.message;
    console.warn('ntfy push failed:', err.message);
    return false;
  }
}

/** Records a notification and pushes it. Never throws. */
export async function notify({ business, kind, ref, title, message, tags, priority = 3, path, actions, sequence, delay, grouped }) {
  /* A sentence may open with "a customer in BR6"; the lock screen wants a capital. */
  message = message ? message[0].toUpperCase() + message.slice(1) : message;
  const told = requestAlerts.getStore();
  if (told) told.sent = true;
  let id = null;
  const who = currentActor();
  try {
    const row = await queryOne(
      'insert into notifications (business_slug, kind, ref, title, message, actor_key, actor_name) values ($1, $2, $3, $4, $5, $6, $7) returning id',
      [business || null, kind, ref == null ? null : Number(ref), title, message, who.key, who.name]
    );
    id = row && row.id;
  } catch (err) {
    console.warn('notification row failed:', err.message);
  }
  const click = path ? staffBase() + path : undefined;
  /* The row keeps this change alone; the push may carry it with the ones just before (lib/activity.js). */
  const sent = await push({ title, message: grouped || message, tags, priority, click, actions, sequence, delay });
  /* The installed staff app buzzes too, for the few kinds worth it, and only
     for the people who hold this business (lib/push.js). */
  if (PUSH_KINDS.has(kind)) await pushToStaff({ business, title, message, tag: `${kind}-${ref ?? ''}`, ...(path ? { url: '/staff' + path } : {}) });
  if (sent && id != null) {
    try { await query('update notifications set push_sent_at = now() where id = $1', [id]); } catch { /* the push went; the stamp is a nicety */ }
  } else if (id != null && (process.env.NTFY_TOPIC || '').trim()) {
    try { await query('update notifications set push_error = $2 where id = $1', [id, String(push.lastError || 'not sent').slice(0, 200)]); } catch { /* best effort */ }
  }
  return { id: id == null ? null : Number(id), sent };
}
