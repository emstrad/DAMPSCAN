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
import { query, queryOne } from './db.js';
import { bestFits } from './best-fit.js';
import { clashFor, logContact, DAMP } from './scheduling.js';
import { setPencil, pencilTimes } from './pencils.js';
import { labFlag } from './availability.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';
import { tellPencil } from './surveyor-alerts.js';

const sign = (s) => createHmac('sha256', process.env.SESSION_SECRET || 'unset').update(s).digest('hex').slice(0, 32);
const keyOf = (leadId, o) => `${leadId}|${o.date}|${o.time}|${o.surveyor}`;
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/* The enquiry this browser just sent: same session, finished, damp, today. */
async function ownLead(leadId, sessionId) {
  const l = await queryOne(`select id, site, first_name, postcode, notes, pencil_date, closed_at, survey_choice from leads
      where id = $1 and session_id = $2::uuid and stage = 'complete' and created_at > now() - interval '1 day'`, [Number(leadId) || 0, String(sessionId || '')]).catch(() => null);
  return l && DAMP.includes(l.site) && !l.closed_at ? l : null;
}
const deadlineText = (notes) => { const m = /needed quickly \(by ([^)]+)\)/.exec(notes || ''); return m ? m[1] : null; };

/**
 * Every day with a free start for this postcode, and every free hour that
 * day, in date order. A time several surveyors could do goes to whoever it
 * suits best (least added driving, snug to their day); who is never shown.
 * Booked surveys, holds, the drive either side, hours and the 75 minute
 * rule all come from lib/best-fit.js, the same engine the team uses.
 */
export async function dayTimes({ postcode, site, today, deadline = null, minutes = null }) {
  const sites = site ? [site] : DAMP;
  const { fits } = await bestFits([{ kind: 'lead', id: 0, postcode, deadline, minutes }], sites, today,
    { fromDays: 2, keep: 1000, freshMax: 1000, lateOk: false });
  const byDay = new Map();
  for (const o of (fits.get('lead:0') || { best: [] }).best) {
    const day = byDay.get(o.date) || new Map();
    for (const st of o.starts || []) {
      /* Whoever covers the area first (Tom London, Ben and Ronnie Kent), then the best fit. */
      const rank = (o.patch === false ? 100000 : 0) + st.score;
      const was = day.get(st.time);
      if (!was || rank < was.rank) day.set(st.time, { time: st.time, surveyor: o.surveyor, score: st.score, rank });
    }
    byDay.set(o.date, day);
  }
  return [...byDay.keys()].sort().map((date) => ({ date, times: [...byDay.get(date).values()].sort((a, b) => a.time.localeCompare(b.time)) }))
    .filter((d) => d.times.length);
}

/** The days and times to show this customer, each time with a ticket to pick it. */
export async function timesFor({ leadId, sessionId, today }) {
  const [slots, quiz] = await Promise.all([labFlag('booking_slots'), labFlag('survey_quiz')]);
  if (!slots && !quiz) return { off: true, days: [], times: [] };
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  /* Which survey first (with prices, or "not sure"), when the owners have it on. */
  if (quiz && !l.survey_choice) return { askSurvey: true, slots, days: [], times: [] };
  if (!slots) return { off: true, days: [], times: [] };
  if (l.pencil_date) return { held: true, days: [], times: [] };
  const days = (await dayTimes({ postcode: l.postcode, site: l.site, today, deadline: deadlineText(l.notes), minutes: l.survey_choice && l.survey_choice.minutes }))
    .map((d) => ({ date: d.date, times: d.times.map((t) => ({ date: d.date, time: t.time, ticket: `${t.surveyor}.${sign(keyOf(l.id, { date: d.date, time: t.time, surveyor: t.surveyor }))}` })) }));
  return { days, times: days.flatMap((d) => d.times) };
}

/* The website's four surveys, as the price list names them, to the rate card. */
const RATE_FOR = { localised: 'localised', full: 'full-house' };
const money = (n) => Math.max(0, Math.min(5000, Math.round(Number(n) || 0)));

/**
 * The survey the customer chose (or "not sure"), kept on the enquiry and in
 * its history so the team sees it on the Scheduling card, with the rate card
 * key and the minutes on site that its free times are worked out with.
 */
export async function saveSurvey({ leadId, sessionId, choice }) {
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  const c = choice && typeof choice === 'object' ? choice : {};
  const unsure = Boolean(c.unsure);
  const size = c.size === 'full' ? 'full' : 'localised';
  const key = unsure ? null : RATE_FOR[size];
  const rate = key ? await queryOne('select duration_min from job_rates where key = $1', [key]) : null;
  const addOns = (Array.isArray(c.addOns) ? c.addOns : []).slice(0, 4).map((a) => ({ name: String(a.name || '').slice(0, 60), price: money(a.price) })).filter((a) => a.name);
  const saved = unsure ? { unsure: true, name: 'Not sure, help me choose' }
    : { name: String(c.name || '').slice(0, 80), price: money(c.price), size, timber: Boolean(c.timber), addOns, key, minutes: rate ? Number(rate.duration_min) : null };
  await query('update leads set survey_choice = $2 where id = $1', [l.id, JSON.stringify(saved)]);
  const words = unsure ? 'Not sure which survey: help them choose when you call.'
    : `Wants ${saved.name} (£${saved.price})${addOns.length ? ' with ' + addOns.map((a) => `${a.name.toLowerCase()} (£${a.price})`).join(' and ') : ''}.`;
  await logContact('lead', Number(l.id), { at: new Date().toISOString(), by: 'Website', how: 'note', note: words }, { moveOn: false });
  return { ok: true };
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
