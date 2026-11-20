/**
 * A reply typed by the team, sent as a text from the brand name (the owner's
 * ask, 16 Nov 2026): one place to answer a customer, mostly a message from
 * their page. It joins the one outbox as kind 'reply' with its words already
 * written, so it waits two minutes (Undo stops it), never goes at night and is
 * checked again before it goes. The brand's sender cannot take replies, so
 * every reply ends with their page, where they can write back; once it has
 * gone it is kept on their card's history (taking it off "Needs you now") and
 * shows on their page under what they wrote.
 */
import { query, queryOne } from './db.js';
import { mobileFor } from './messages.js';
import { portalLinkFor } from './portal.js';
import { DAMP_BRANDS } from './survey-messages.js';

export const REPLIED = 'We replied: ';
const DAMP = ['dampscan', 'ati-london'];
const STAFF_WAIT_SEC = 120;
const first = (n) => String(n || '').trim().split(/\s+/)[0];
/* The owners' shared code signs as the brand alone: never "Owners" or "Staff". */
const signer = (name) => (name && !['Owners', 'Staff'].includes(name) ? first(name) : null);

/** The text as it lands: their words, who it is from, and their page to write back. */
export function replyBody(words, { who, brand, link }) {
  return `${words}\n\n${who ? who + ', ' : ''}${brand}${link ? `\nTo reply, message us on your page: ${link}` : ''}`;
}

export async function queueReply(jobId, words, by) {
  const said = String(words || '').replace(/[ \t]+/g, ' ').trim().slice(0, 1000);
  if (said.length < 2) return { error: 'Type the reply first.' };
  const j = await queryOne('select id, site, customer_phone, status from jobs where id = $1', [jobId]);
  if (!j || !DAMP.includes(j.site)) return { error: 'not_found' };
  if (!mobileFor(j.customer_phone)) return { error: 'No mobile for them: call or email instead.' };
  const link = String(await portalLinkFor(j.id) || '').replace('/my.html?t=', '/m/');
  const who = signer(by);
  const body = replyBody(said, { who, brand: DAMP_BRANDS[j.site].name, link });
  const row = await queryOne(`insert into sms_outbox (site, job_id, kind, dedupe, send_after, created_by, body, payload)
      values ($1, $2, 'reply', $3, now() + make_interval(secs => $4), $5, $6, $7) returning id`,
    [j.site, j.id, 'r' + Date.now(), STAFF_WAIT_SEC, by || null, body, JSON.stringify({ said, who })]);
  return { ok: true, textId: Number(row.id) };
}

/** Once it has gone: on their history (their page shows it, and Needs you now lets go). */
export async function replySent(row) {
  const p = row.payload || {};
  if (!row.job_id || !p.said) return;
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [row.job_id, JSON.stringify([{ at: new Date().toISOString(), by: p.who || row.created_by || 'Team', how: 'text', note: REPLIED + p.said }])]);
}
