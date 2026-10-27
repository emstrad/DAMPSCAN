/**
 * Picking a survey time on the website, once the enquiry is in. The times
 * come from the same engine the team uses on the phone (lib/best-fit.js):
 * the customer's own postcode, real drive times, no hop over 75 minutes
 * between surveys, the drive from home counted, someone already nearby
 * first, two days' notice, and nothing after a buyer's deadline. Who would
 * go is never shown.
 *
 * A pick is a request, not a booking (the owners' choice for now): it holds
 * the time as an ordinary pencilled hold for 48 hours, everything is checked
 * again at that moment (another customer, or the team, may have taken it
 * since the times were shown), and the team confirms it on Scheduling.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { queryOne } from './db.js';
import { bestFits } from './best-fit.js';
import { clashFor, logContact, DAMP } from './scheduling.js';
import { setPencil, pencilTimes } from './pencils.js';
import { labFlag } from './availability.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';
import { tellPencil } from './surveyor-alerts.js';

const OFFER = 6;
const sign = (s) => createHmac('sha256', process.env.SESSION_SECRET || 'unset').update(s).digest('hex').slice(0, 32);
const keyOf = (leadId, o) => `${leadId}|${o.date}|${o.time}|${o.surveyor}`;
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/* The enquiry this browser just sent: same session, finished, damp, today. */
async function ownLead(leadId, sessionId) {
  const l = await queryOne(`select id, site, first_name, postcode, notes, pencil_date, closed_at from leads
      where id = $1 and session_id = $2::uuid and stage = 'complete' and created_at > now() - interval '1 day'`, [Number(leadId) || 0, String(sessionId || '')]).catch(() => null);
  return l && DAMP.includes(l.site) && !l.closed_at ? l : null;
}
const deadlineText = (notes) => { const m = /needed quickly \(by ([^)]+)\)/.exec(notes || ''); return m ? m[1] : null; };

/** The times to show this customer, best first, each with a ticket to pick it. */
export async function timesFor({ leadId, sessionId, today }) {
  if (!(await labFlag('booking_slots'))) return { off: true, times: [] };
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  if (l.pencil_date) return { held: true, times: [] };
  const { fits } = await bestFits([{ kind: 'lead', id: Number(l.id), postcode: l.postcode, deadline: deadlineText(l.notes) }], [l.site], today,
    { fromDays: 2, keep: OFFER, freshMax: 3, lateOk: false });
  const best = (fits.get('lead:' + l.id) || { best: [] }).best;
  return { times: best.map((o) => ({ date: o.date, time: o.time, ticket: `${o.surveyor}.${sign(keyOf(l.id, o))}` })) };
}

/** Holds the chosen time for the team to confirm, if it is still free. */
export async function pickTime({ leadId, sessionId, date, time, ticket, today }) {
  if (!(await labFlag('booking_slots'))) return { error: 'off' };
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  const [surveyor, sig] = String(ticket || '').split('.');
  const want = sign(keyOf(l.id, { date, time, surveyor }));
  if (!sig || sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return { error: 'bad_ticket' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return { error: 'gone' };
  /* Checked again now: hours, booked surveys and the drive, then anyone holding it. */
  const clash = await clashFor(surveyor, date, time, null, l.postcode);
  const held = (await pencilTimes(DAMP, date, date)).some((p) => p.surveyor === surveyor && Math.abs(toMin(p.time) - toMin(time)) < 120);
  if (clash || held) return { error: 'taken' };
  await setPencil('lead', Number(l.id), { date, time, surveyor, by: 'Website' });
  await tellPencil({ surveyor, name: l.first_name, postcode: l.postcode, date, time, by: 'Website' });
  await logContact('lead', Number(l.id), { at: new Date().toISOString(), by: 'Website', how: 'note', note: `Picked ${nice(date, time)} on the website. Waiting for us to confirm.` }, { moveOn: false });
  await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'calendar', priority: 4, path: `/schedule.html#lead-${l.id}`,
    title: `Time requested: ${brandName(l.site)}`,
    message: `${customer(l.first_name, l.postcode, ' in ')} picked ${nice(date, time)} (${surveyor[0].toUpperCase() + surveyor.slice(1)}). Confirm it on Scheduling.` });
  return { ok: true, said: nice(date, time) };
}
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
