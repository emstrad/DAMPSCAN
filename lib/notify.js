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
 * The one rule: a title or message may name a business, a job number, an
 * amount and a member of staff. It may never carry a customer's name, number,
 * address or postcode, because a push sits on a lock screen.
 */
import { query, queryOne } from './db.js';

const TIMEOUT_MS = 4000;

/** Sends one push. True when ntfy accepted it, false when not configured or it failed. */
export async function push({ title, message, tags = 'bell', priority = 3 }) {
  const topic = (process.env.NTFY_TOPIC || '').trim();
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
      body: JSON.stringify({ topic, title, message, tags: String(tags).split(','), priority }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) console.warn('ntfy refused a push:', res.status);
    return res.ok;
  } catch (err) {
    console.warn('ntfy push failed:', err.message);
    return false;
  }
}

/** Records a notification and pushes it. Never throws. */
export async function notify({ business, kind, ref, title, message, tags }) {
  let id = null;
  try {
    const row = await queryOne(
      'insert into notifications (business_slug, kind, ref, title, message) values ($1, $2, $3, $4, $5) returning id',
      [business || null, kind, ref == null ? null : Number(ref), title, message]
    );
    id = row && row.id;
  } catch (err) {
    console.warn('notification row failed:', err.message);
  }
  const sent = await push({ title, message, tags });
  if (sent && id != null) {
    try { await query('update notifications set push_sent_at = now() where id = $1', [id]); } catch { /* the push went; the stamp is a nicety */ }
  }
  return { id: id == null ? null : Number(id), sent };
}
