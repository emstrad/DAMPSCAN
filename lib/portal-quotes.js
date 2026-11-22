/**
 * A quote to check, from the customer's page (the owner, 22 Nov 2026: "upload
 * photos or quotes you receive and we will help"): once their report is done,
 * they send a contractor's quote (PDF or photos) and we check it against the
 * report, free, replying through Message us. Through /api/upload, only paths it
 * made; kept on the survey (jobs.customer_quotes), with a line in their history,
 * one owners' to-do and an alert. Nothing reaches the customer by itself.
 */
import { query } from './db.js';
import { ipHash } from './http.js';
import { notify } from './notify.js';
import { customer, jobPage, brandName } from './alert-words.js';
import { logEvent, deviceOf } from './portal-events.js';
import { buildView } from './portal-view.js';

export const MAX_QUOTE_FILES = 5;
/* Exactly what the upload route makes: a day, a random uuid and the name. */
const UPLOAD_PATH = /^leads\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.-]{1,120}$/i;
const QUOTE_FILE = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];
const first = (n) => String(n || 'A customer').trim().split(/\s+/)[0];

/** Only once the report is done: before then there is nothing to check a quote against. */
export const canSendQuote = (j, view = buildView(j)) => ['ready', 'report'].includes(view.state);

export async function addQuote(req, j, paths) {
  if (!canSendQuote(j)) return { error: 'not_now' };
  const list = (Array.isArray(paths) ? paths : []).map(String).filter((p) => UPLOAD_PATH.test(p) && QUOTE_FILE.test(p));
  if (!list.length) return { error: 'no_files' };
  const had = (j.customer_quotes || []).length;
  if (had + list.length > MAX_QUOTE_FILES) return { error: 'too_many' };
  await query(`update jobs set customer_quotes = coalesce(customer_quotes, '{}') || $2::text[] where id = $1`, [j.id, list]);
  await logEvent(j.id, 'quote', { ipHash: ipHash(req), device: deviceOf(req), detail: String(list.length) });
  const files = `${list.length} file${list.length === 1 ? '' : 's'}`;
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note: `Sent a quote to check against their report (${files}), under Details.` }])]);
  /* One open quote to check per survey: a second upload adds to the same one. */
  const open = await query(`select id from todos where job_id = $1 and done_at is null and set_by_name = 'Their page' and text like '%quote to check%' limit 1`, [j.id]);
  if (!open.length) {
    await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Their page', 'manual', true)`,
      [j.site, j.id, `${first(j.customer_name)} (${district(j.customer_postcode)}) sent a quote to check against their report (under Details on their card). Reply through their messages.`]);
  }
  await notify({ business: j.site, kind: 'portal_quote', ref: j.id, tags: 'page_facing_up', priority: 4, path: jobPage(j.site, j.id),
    title: `Quote to check: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} sent a quote to check (${files}).` });
  return { ok: true, added: list.length };
}
