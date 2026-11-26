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
import { surveyMinutes } from './travel-guard.js';
import { bookOnline, instantOn } from './instant-book.js';
import { query, queryOne } from './db.js';
import { bestFits } from './best-fit.js';
import { SIZES, EXTRAS, EXTRA_MINUTES, priceList } from '../content/prices.js';
import { clashFor, logContact, DAMP } from './scheduling.js';
import { setPencil, pencilTimes } from './pencils.js';
import { labFlag } from './availability.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';
import { tellPencil } from './surveyor-alerts.js';
import { textOwners, pickText } from './staff-sms.js';
import { reachedTimes, recordOutcome } from './form-outcome.js';

const sign = (s) => createHmac('sha256', process.env.SESSION_SECRET || 'unset').update(s).digest('hex').slice(0, 32);
const keyOf = (leadId, o) => `${leadId}|${o.date}|${o.time}|${o.surveyor}`;
const nice = (d, t) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} at ${t}`;

/* The enquiry this browser just sent: same session, finished, damp, today. */
async function ownLead(leadId, sessionId) {
  const l = await queryOne(`select id, site, first_name, postcode, phone, notes, pencil_date, closed_at, survey_choice from leads
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
/* exceptJob: a survey being moved does not block its own way; surveyor: only their times (a customer moving keeps theirs); days: how far ahead. */
export async function dayTimes({ postcode, site, today, deadline = null, minutes = null, exceptJob = null, surveyor = null, days = 14 }) {
  const sites = site ? [site] : DAMP;
  const { fits } = await bestFits([{ kind: 'lead', id: 0, postcode, deadline, minutes }], sites, today,
    { days, fromDays: 2, keep: 1000, freshMax: 1000, lateOk: false, exceptJob });
  const byDay = new Map();
  for (const o of (fits.get('lead:0') || { best: [] }).best) {
    if (surveyor && o.surveyor !== surveyor) continue;
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

/**
 * The days and times to show this customer, each time with a ticket to pick
 * it. Time first (the owners' choice: least friction), then which survey;
 * prices come with the answer whenever the survey is still to be asked.
 */
export async function timesFor({ leadId, sessionId, today, days: ahead = 14 }) {
  const [slots, quiz] = await Promise.all([labFlag('booking_slots'), labFlag('survey_quiz')]);
  if (!slots && !quiz) return { off: true, days: [], times: [] };
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  /* Booked straight away: the survey first, so every time offered fits it exactly. */
  const instant = slots && await instantOn();
  const known = l.survey_choice && (typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice).minutes;
  if (instant && !known) return { askSurvey: true, surveyFirst: true, instant: true, prices: priceList(), days: [], times: [] };
  const ask = quiz && !l.survey_choice ? { askSurvey: true, prices: priceList() } : {};
  if (!slots) return { ...ask, days: [], times: [] };
  if (l.pencil_date) return { held: true, ...ask, days: [], times: [] };
  await reachedTimes(l.id);
  const days = (await dayTimes({ postcode: l.postcode, site: l.site, today, deadline: deadlineText(l.notes), minutes: l.survey_choice && l.survey_choice.minutes, days: Math.min(56, Math.max(14, Number(ahead) || 14)) }))
    .map((d) => ({ date: d.date, times: d.times.map((t) => ({ date: d.date, time: t.time, ticket: `${t.surveyor}.${sign(keyOf(l.id, { date: d.date, time: t.time, surveyor: t.surveyor }))}` })) }));
  return { days, times: days.flatMap((d) => d.times), ...ask, ...(instant ? { instant: true } : {}) };
}

/*
 * What the customer chose, priced from the one list (content/prices.js), never
 * from what the browser sends: a survey (damp, or damp and timber) by size with
 * any add-ons at the with-a-survey price, or "not sure".
 */
function priced(c) {
  const extra = (keys) => EXTRAS.filter((x) => (keys || []).includes(x.key) && x.addable)
    .map((x) => ({ key: x.key, name: x.name, price: x.withSurvey, from: Boolean(x.from) }));
  /* Not sure which survey still gives the size, so the time on site is known: it is
     booked as a damp survey of that size and the team talks timber through on the call. */
  if (c.service === 'damp' || c.service === 'timber' || (c.service === 'unsure' && c.size)) {
    const size = SIZES.find((x) => x.key === c.size);
    /* "Not sure" lets them carry on with a survey but no size: kept for the call, not priced. */
    if (!size) return c.service === 'unsure' ? null : { service: c.service, unsure: true, name: `${c.service === 'timber' ? 'Damp and timber' : 'Damp'} survey, size to agree`, addOns: extra(c.extras) };
    const timber = c.service === 'timber';
    const unsure = c.service === 'unsure';
    const addOns = extra(c.extras);
    return { service: c.service, ...(unsure ? { unsure: true } : {}), name: `${size.name} ${timber ? 'damp and timber' : 'damp'} survey`, size: size.key, scope: size.scope,
      price: size.damp + (timber ? size.timber : 0), from: size.from, timber, addOns, key: (timber ? 'dt-' : '') + size.key, minutes: size.minutes + addOns.length * EXTRA_MINUTES };
  }
  /* No check on its own: a damp survey is always booked (the owners' choice, 8 Nov 2026). */
  if (c.service === 'alone') return null;
  /* Times for someone not sure are found at a full house's length, so the time held fits most surveys. */
  const full = SIZES.find((x) => x.key === 'full-house');
  return { unsure: true, name: 'Not sure, help me choose', ...(full ? { minutes: full.minutes } : {}) };
}
const sayPrice = (p, from) => `${from ? 'from ' : ''}£${p}`;

/**
 * The survey the customer chose, kept on the enquiry and in its history so the
 * team sees it on the Scheduling card, with the rate card key and the minutes
 * on site. Chosen after a time was picked and longer than the usual hour, the
 * history says so, for the team to check the time still fits when confirming.
 */
export async function saveSurvey({ leadId, sessionId, choice }) {
  const l = await ownLead(leadId, sessionId);
  if (!l) return { error: 'not_found' };
  const saved = priced(choice && typeof choice === 'object' ? choice : {});
  if (!saved) return { error: 'bad_choice' };
  await query('update leads set survey_choice = $2 where id = $1', [l.id, JSON.stringify(saved)]);
  const adds = (saved.addOns || []).map((a) => `${a.name.toLowerCase()} (${sayPrice(a.price, a.from)})`);
  const words = saved.unsure ? (saved.service ? `Wants a ${saved.name.toLowerCase()}: help them choose when you call.` : 'Not sure which survey: help them choose when you call.')
    : `Wants ${saved.name} (${sayPrice(saved.price, saved.from)})${adds.length ? ' with ' + adds.join(' and ') : ''}.`
      + (l.pencil_date && saved.minutes > 60 ? ` About ${saved.minutes} minutes on site: check the time they picked still fits.` : '');
  await logContact('lead', Number(l.id), { at: new Date().toISOString(), by: 'Website', how: 'note', note: words }, { moveOn: false });
  return { ok: true, chose: { name: saved.name, price: saved.price, from: saved.from, addOns: saved.addOns } };
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
  const clash = await clashFor(surveyor, date, time, null, l.postcode, await surveyMinutes({ leadId: Number(l.id) }));
  const held = (await pencilTimes(DAMP, date, date)).some((p) => p.surveyor === surveyor && Math.abs(toMin(p.time) - toMin(time)) < 120);
  if (clash || held) return { error: 'taken' };
  /* Booked straight away (switched on in the Lab): the survey is known and the time fits it, so it is a booking, not a request. */
  /* With no survey chosen ("Not sure, continue", 21 Nov 2026) the time is held for us to confirm the survey and price on a call, never booked. */
  const chose = typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice;
  if (chose && chose.key && await instantOn()) {
    const done = await bookOnline(l, { date, time, surveyor });
    /* Their own page there and then (the new booking form's Done: pay the deposit, see the visit), the same link the booked text carries. */
    const page = done.booked && done.jobId ? await import('./portal.js').then((m) => m.portalLinkFor(done.jobId)).catch(() => null) : null;
    if (done.booked) await recordOutcome(l.id, 'picked');
    return done.booked ? { ok: true, said: nice(date, time), booked: true, ...(page ? { page } : {}) } : { error: 'taken' };
  }
  await setPencil('lead', Number(l.id), { date, time, surveyor, by: 'Website' });
  await tellPencil({ surveyor, name: l.first_name, postcode: l.postcode, date, time, by: 'Website' });
  await logContact('lead', Number(l.id), { at: new Date().toISOString(), by: 'Website', how: 'note', note: `Picked ${nice(date, time)} on the website. Waiting for us to confirm.` }, { moveOn: false });
  await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'calendar', priority: 4, path: `/schedule.html#lead-${l.id}`,
    title: `Time requested: ${brandName(l.site)}`,
    message: `${customer(l.first_name, l.postcode, ' in ')} picked ${nice(date, time)} (${surveyor[0].toUpperCase() + surveyor.slice(1)}). Confirm it on Scheduling.` });
  await textOwners(pickText(l, nice(date, time), surveyor[0].toUpperCase() + surveyor.slice(1)));
  await recordOutcome(l.id, 'picked');
  return { ok: true, said: nice(date, time) };
}
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
