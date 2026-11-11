/**
 * What a customer can ask from their page (the owners' plan, 11 Nov 2026),
 * ATi and DampScan:
 *
 *   message   a few words to the team: on the card's history, an app alert
 *             and a text to the owners (lib/staff-sms.js)
 *   move      a new time for a booked survey, from the surveyors' real free
 *             times (the website picker's engine, lib/web-booking.js). Only a
 *             request: the owners are told, a to-do is made, and the team
 *             moves it on the job card (which texts the customer, text 7)
 *   photos    more photos before the visit, through the booking form's own
 *             upload route, added to the enquiry (or the job when there is none)
 *
 * Nothing here changes the booking or reaches the customer by itself. Each
 * is logged on the page's trail (portal_events) with a hashed IP only.
 */
import { query, queryOne } from './db.js';
import { ipHash } from './http.js';
import { notify } from './notify.js';
import { customer, jobPage, brandName, staffBase } from './alert-words.js';
import { textOwners } from './staff-sms.js';
import { logEvent, deviceOf } from './portal-events.js';
import { buildView, startOf } from './portal-view.js';
import { dayTimes } from './web-booking.js';
import { EXTRA_MINUTES } from '../content/prices.js';

const MAX_MESSAGES_A_DAY = 5;
const MAX_PHOTOS = 10;
const MOVE_DAYS = 21;
/* Exactly what the upload route makes: a day, a random uuid and the name. */
const UPLOAD_PATH = /^leads\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.-]{1,120}$/i;
const PHOTO = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;
const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];
const first = (n) => String(n || 'A customer').trim().split(/\s+/)[0];
const ev = (req) => ({ ipHash: ipHash(req), device: deviceOf(req) });

async function history(j, note) {
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note }])]);
}

export async function messageUs(req, j, words) {
  const text = String(words || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (text.length < 2) return { error: 'empty' };
  const sent = await queryOne(`select count(*)::int as n from portal_events where job_id = $1 and kind = 'message' and at > now() - interval '1 day'`, [j.id]);
  if (sent.n >= MAX_MESSAGES_A_DAY) return { error: 'too_many' };
  await logEvent(j.id, 'message', ev(req));
  await history(j, `They wrote on their page: ${text}`);
  await notify({ business: j.site, kind: 'portal_message', ref: j.id, tags: 'speech_balloon', priority: 4, path: jobPage(j.site, j.id),
    title: `Message from their page: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} sent a message. Open their card to read it.` });
  /* The words stay in the app: a text to the owners says who, never what (it may be private). */
  await textOwners(`${brandName(j.site)}: ${first(j.customer_name)} (${district(j.customer_postcode)}) sent a message from their survey page. Read it on their card. ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true };
}

/* A move is only offered for a booked, dated survey more than a day away. */
export function canMove(j, view = buildView(j)) {
  if (!view.visit || !['deposit', 'booked'].includes(view.state)) return false;
  const start = startOf(view.visit.date, view.visit.time);
  return Boolean(start && start.getTime() - Date.now() > 24 * 3600000);
}

/** The days and hours they could move to: every surveyor's real free time, never who. */
export async function moveTimes(j, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  if (!canMove(j)) return { error: 'not_now' };
  const rate = await queryOne('select duration_min as minutes from job_rates where key = $1', [j.survey_type]).catch(() => null);
  const minutes = (rate && Number(rate.minutes)) || 60;
  const days = await dayTimes({ postcode: j.customer_postcode, site: j.site, today, minutes: minutes + (Number(j.extra_minutes) || (j.extras || []).length * EXTRA_MINUTES) });
  const last = new Date(Date.parse(today + 'T12:00:00Z') + MOVE_DAYS * 86400000).toISOString().slice(0, 10);
  return { days: days.filter((d) => d.date <= last).map((d) => ({ date: d.date, times: d.times.map((t) => t.time) })) };
}

export async function askToMove(req, j, { date, time }) {
  const offered = await moveTimes(j);
  if (offered.error) return offered;
  const day = (offered.days || []).find((d) => d.date === date);
  if (!day || !day.times.includes(time)) return { error: 'taken' };
  const from = `${j.job_day} ${String(j.job_time).slice(0, 5)}`;
  await query(`update jobs set move_request = $2::jsonb where id = $1`, [j.id, JSON.stringify({ date, time, from, at: new Date().toISOString() })]);
  await logEvent(j.id, 'move', { ...ev(req), detail: `${date} ${time}` });
  const when = nice(date, time);
  await history(j, `Asked on their page to move to ${when}.`);
  await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Their page', 'manual', true)`,
    [j.site, j.id, `${first(j.customer_name)} (${district(j.customer_postcode)}) asked to move their survey to ${when}. Move it on their job card if it still suits (they get the moved text), or call them.`]);
  await notify({ business: j.site, kind: 'portal_move', ref: j.id, tags: 'calendar', priority: 4, path: jobPage(j.site, j.id),
    title: `Move asked for: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} asked to move to ${when}.` });
  await textOwners(`${brandName(j.site)}: ${first(j.customer_name)} (${district(j.customer_postcode)}) asked to move their survey to ${when}. Confirm on their job card. ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true, asked: { date, time } };
}

/** The move they asked for, while the survey is still where it was. */
export function moveAsked(j) {
  const m = j.move_request;
  if (!m || !m.date) return null;
  const now = `${j.job_day} ${String(j.job_time || '').slice(0, 5)}`;
  return m.from === now ? { date: m.date, time: m.time } : null;
}

export async function addPhotos(req, j, paths) {
  const list = (Array.isArray(paths) ? paths : []).map(String).filter((p) => UPLOAD_PATH.test(p) && PHOTO.test(p)).slice(0, MAX_PHOTOS);
  if (!list.length) return { error: 'no_photos' };
  const had = (j.lead_files || []).length + (j.customer_files || []).length;
  if (had + list.length > 30) return { error: 'too_many' };
  if (j.lead_id) await query(`update leads set files = coalesce(files, '{}') || $2::text[] where id = $1`, [j.lead_id, list]);
  else await query(`update jobs set customer_files = coalesce(customer_files, '{}') || $2::text[] where id = $1`, [j.id, list]);
  await logEvent(j.id, 'photos', { ...ev(req), detail: String(list.length) });
  await history(j, `Added ${list.length} photo${list.length === 1 ? '' : 's'} on their page.`);
  await notify({ business: j.site, kind: 'portal_photos', ref: j.id, tags: 'camera', priority: 3, path: jobPage(j.site, j.id),
    title: `Photos added: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} added ${list.length} photo${list.length === 1 ? '' : 's'}.` });
  return { ok: true, added: list.length };
}
