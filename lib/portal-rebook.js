/**
 * Booking again from a cancelled survey's page (the owner, 22 Nov 2026: a
 * cancelled page offered nothing but a phone number). The customer sees their
 * survey as before (type, extras, price) and every surveyor's real free times
 * (the website picker's engine, never who). With the Lab's Book it straight
 * away on, the time tapped books it there and then through Scheduling's own
 * Bring back and Book it, so the drive check, the surveyor's diary alert and
 * the booked text with the deposit link all follow; twice per survey. After
 * that, or with the switch off, it is a request: an owners' to-do, alert and
 * text, booked on their card after a call.
 */
import { query, queryOne } from './db.js';
import { ipHash } from './http.js';
import { notify } from './notify.js';
import { customer, jobPage, brandName, staffBase } from './alert-words.js';
import { textOwners, call } from './staff-sms.js';
import { logEvent, deviceOf } from './portal-events.js';
import { buildView } from './portal-view.js';
import { dayTimes } from './web-booking.js';
import { EXTRA_MINUTES } from '../content/prices.js';
import { instantOn } from './instant-book.js';
import { callRoute } from './mcp/shared.js';
import { flushDue } from './texts.js';
import scheduling from './routes/admin/scheduling.js';

export const SELF_REBOOKS = 2;
const PAGE = { personId: null, name: 'Their page', isAdmin: true, businesses: ['dampscan', 'ati-london'], levels: {} };
const money = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

const DAYS = 21;
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;
const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];
const first = (n) => String(n || 'A customer').trim().split(/\s+/)[0];

export function canRebook(j, view = buildView(j)) {
  return view.state === 'cancelled' && Boolean(j.customer_postcode);
}

/** The time they asked for, while the survey is still cancelled. */
export function rebookAsked(j) {
  const m = j.move_request;
  return m && m.rebook && m.date && ['cancelled', 'declined', 'refunded'].includes(j.status) ? { date: m.date, time: m.time } : null;
}

export async function rebookTimes(j, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  if (!canRebook(j)) return { error: 'not_now' };
  const rate = await queryOne('select duration_min as minutes, label from job_rates where key = $1', [j.survey_type]).catch(() => null);
  const minutes = ((rate && Number(rate.minutes)) || 60) + (Number(j.extra_minutes) || (j.extras || []).length * EXTRA_MINUTES);
  const days = await dayTimes({ postcode: j.customer_postcode, site: j.site, today, minutes });
  const last = new Date(Date.parse(today + 'T12:00:00Z') + DAYS * 86400000).toISOString().slice(0, 10);
  return { days: days.filter((d) => d.date <= last), survey: { label: (rate && rate.label) || 'Damp survey', extras: (j.extras || []).map(String), price: money(Number(j.survey_price_pence) || 0) }, self: await rebooksItself(j) };
}

/** Whether a time tapped books it now (else it is a request for the team). */
export async function rebooksItself(j) {
  if (!(await instantOn())) return false;
  const n = await queryOne(`select count(*)::int as n from portal_events where job_id = $1 and kind = 'rebooked'`, [j.id]);
  return Number(n.n) < SELF_REBOOKS;
}

/** What the page sees: days and times, never who. */
export async function pageTimes(j) {
  const out = await rebookTimes(j);
  return out.error ? out : { ...out, days: out.days.map((d) => ({ date: d.date, times: d.times.map((t) => t.time) })) };
}

/** Booked there and then: brought back, then booked with whoever has that time, as Scheduling does it. */
export async function rebookNow(req, j, { date, time }) {
  const offered = await rebookTimes(j);
  if (offered.error) return offered;
  const day = (offered.days || []).find((d) => d.date === date);
  const slot = day && day.times.find((t) => t.time === time);
  if (!slot) return { error: 'taken' };
  const was = { status: j.status, cancelledAt: j.cancelled_at };
  await callRoute(scheduling, PAGE, { method: 'POST', url: '/api/admin/scheduling', body: { op: 'move', kind: 'job', id: Number(j.id), to: 'waiting' } });
  const out = await callRoute(scheduling, PAGE, { method: 'POST', url: '/api/admin/scheduling', body: { op: 'book', kind: 'job', id: Number(j.id), date, time, surveyor: slot.surveyor } });
  if (out.status >= 400 || (out.data && out.data.ok === false)) {
    /* Gone a moment before: back as it was, cancelled on its first day so the refund rule is unchanged. */
    await query('update jobs set status = $2 where id = $1', [j.id, was.status]);
    if (was.cancelledAt) await query('update jobs set cancelled_at = $2 where id = $1', [j.id, was.cancelledAt]);
    return { error: 'taken' };
  }
  await logEvent(j.id, 'rebooked', { ipHash: ipHash(req), device: deviceOf(req), detail: `${date} ${time}` });
  const when = nice(date, time);
  await query(`update jobs set move_request = null, sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note: `Booked again on their page for ${when}, the same survey (${offered.survey.label}, ${offered.survey.price}).` }])]);
  /* They did it, so their text goes now rather than after the staff's two minutes. */
  await query("update sms_outbox set send_after = now() where job_id = $1 and kind in ('booked', 'moved') and status = 'waiting'", [j.id]);
  await flushDue({ limit: 3 }).catch(() => {});
  await notify({ business: j.site, kind: 'portal_move', ref: j.id, tags: 'calendar', priority: 4, path: jobPage(j.site, j.id),
    title: `Booked again by the customer: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} booked again for ${when}.` });
  await textOwners(`${brandName(j.site)}: ${first(j.customer_name)} (${district(j.customer_postcode)}) cancelled before and booked again on their page for ${when}.${call(j.customer_phone)} ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true, booked: { date, time } };
}

export async function askRebook(req, j, { date, time }) {
  const offered = await rebookTimes(j);
  if (offered.error) return offered;
  const day = (offered.days || []).find((d) => d.date === date);
  if (!day || !day.times.some((t) => t.time === time)) return { error: 'taken' };
  const when = nice(date, time);
  await query('update jobs set move_request = $2::jsonb where id = $1',
    [j.id, JSON.stringify({ date, time, rebook: true, from: `${j.job_day} ${String(j.job_time || '').slice(0, 5)}`, at: new Date().toISOString() })]);
  await logEvent(j.id, 'rebook', { ipHash: ipHash(req), device: deviceOf(req), detail: `${date} ${time}` });
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note: `Asked on their page to book again for ${when}.` }])]);
  await query(`update todos set done_at = now() where job_id = $1 and done_at is null and set_by_name = 'Their page' and text like '%book again%'`, [j.id]);
  await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Their page', 'manual', true)`,
    [j.site, j.id, `${first(j.customer_name)} (${district(j.customer_postcode)}) asked to book again for ${when}. Call them, then Bring back to Scheduling and book it on their card.`]);
  await notify({ business: j.site, kind: 'portal_move', ref: j.id, tags: 'calendar', priority: 4, path: jobPage(j.site, j.id),
    title: `Wants to book again: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} asked to book again for ${when}.` });
  await textOwners(`${brandName(j.site)}: ${first(j.customer_name)} (${district(j.customer_postcode)}) cancelled before and asked on their page to book again for ${when}.${call(j.customer_phone)} ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true, asked: { date, time } };
}
