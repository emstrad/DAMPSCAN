/**
 * Moving their survey themselves from their page (the owner's choice, 13 Nov
 * 2026, with the Lab's Book it straight away on): the customer picks one of
 * their own surveyor's real free times (the website picker's engine, their
 * survey not in its own way) and it moves there and then, through the same
 * client card route the team uses, so the drive check, the surveyor's diary
 * alert and the moved text ("all done, as you asked") all follow. Twice per
 * survey; after that, and with the switch off, it stays a request for the
 * team (lib/portal-asks.js askToMove).
 */
import { query, queryOne } from './db.js';
import { ipHash } from './http.js';
import { notify } from './notify.js';
import { customer, jobPage, brandName, staffBase } from './alert-words.js';
import { textOwners } from './staff-sms.js';
import { logEvent, deviceOf } from './portal-events.js';
import { instantOn } from './instant-book.js';
import { moveTimes } from './portal-asks.js';
import { callRoute } from './mcp/shared.js';
import { flushDue } from './texts.js';
import clients from './routes/admin/clients.js';

export const SELF_MOVES = 2;
const PAGE = { personId: null, name: 'Their page', isAdmin: true, businesses: ['dampscan', 'ati-london'], levels: {} };
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;
const first = (n) => String(n || 'A customer').trim().split(/\s+/)[0];
const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];

/** Whether this customer moves it themselves now (else it is a request). */
export async function movesItself(j) {
  if (!(await instantOn()) || !j.surveyor) return false;
  const n = await queryOne(`select count(*)::int as n from portal_events where job_id = $1 and kind = 'moved_self'`, [j.id]);
  return Number(n.n) < SELF_MOVES;
}

export async function moveNow(req, j, { date, time }) {
  const offered = await moveTimes(j, undefined, { own: true });
  if (offered.error) return offered;
  const day = (offered.days || []).find((d) => d.date === date);
  if (!day || !day.times.includes(time)) return { error: 'taken' };
  const from = `${j.job_day} ${String(j.job_time).slice(0, 5)}`;
  /* Noted as asked for, so the moved text says "as you asked". */
  await query('update jobs set move_request = $2::jsonb where id = $1', [j.id, JSON.stringify({ date, time, from, at: new Date().toISOString(), self: true })]);
  const out = await callRoute(clients, PAGE, { method: 'POST', url: '/api/admin/clients', body: { id: Number(j.id), jobDate: date, jobTime: time } });
  if (out.status >= 400) return { error: 'taken' };
  await logEvent(j.id, 'moved_self', { ipHash: ipHash(req), device: deviceOf(req), detail: `${from} to ${date} ${time}` });
  const when = nice(date, time);
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
    [j.id, JSON.stringify([{ at: new Date().toISOString(), by: 'Their page', how: 'note', note: `Moved their survey on their page from ${nice(...from.split(' '))} to ${when}.` }])]);
  /* They did it, so their text goes now rather than after the staff's two minutes. */
  await query("update sms_outbox set send_after = now() where job_id = $1 and kind = 'moved' and status = 'waiting'", [j.id]);
  await flushDue({ limit: 3 }).catch(() => {});
  await notify({ business: j.site, kind: 'portal_move', ref: j.id, tags: 'calendar', priority: 4, path: jobPage(j.site, j.id),
    title: `Moved by the customer: ${brandName(j.site)}`, message: `${customer(j.customer_name, j.customer_postcode)} moved their survey to ${when}.` });
  await textOwners(`${brandName(j.site)}: ${first(j.customer_name)} (${district(j.customer_postcode)}) moved their survey to ${when} on their page. ${staffBase()}${jobPage(j.site, j.id)}`);
  return { ok: true, moved: { date, time } };
}
