/**
 * /api/admin/roofing: the Verge Roofing pipeline, week board and job planner.
 *
 *   GET  ?view=board                      enquiries and every live job, by stage
 *   GET  ?view=week&from=YYYY-MM-DD       Monday to Saturday from that Monday
 *   GET  ?view=job&id=                    one card, its planner and the finishing messages
 *   POST {op:'stage', id, to, date?, time?}  a card to another stage (see MOVES)
 *   POST {op:'date', id, date}            a booked job to a new start date (week board drag)
 *   POST {op:'task', id, kind, status?, date?, supplier?, costPence?, note?, personId?, remove?}
 *   POST {op:'plan', id, expectedDays}    how many days the crew expect
 *   POST {op:'finish', id, step:'google', on}   the one finishing step with no message
 *   POST {op:'restore', id, state}        Undo: puts back what a write returned as `undo`
 *
 * Stage, date and finish writes return the card and an `undo` body, as the
 * damp board does, so every move on the board can be taken back. The
 * forecast is added to booked work in the next week when it can be had
 * quickly; the board never waits on it for long (lib/weather.js).
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { record } from '../../audit.js';
import { londonToday } from '../../pipeline.js';
import { ROOF_SITES, roofBoard, roofCard, roofWeek, workingDays } from '../../roofing.js';
import { saveTask, planOf } from '../../roofing-plan.js';
import { forecasts, dayOf } from '../../weather.js';
import { businessFor, present } from '../../quoted.js';
import { forViewer } from '../../profit.js';

export const config = { runtime: 'nodejs' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const STATE = ['status', 'job_date', 'job_time', 'date_set', 'site_visit_on', 'visit_done_at', 'won_at', 'started_at', 'stage_at', 'google_posted_at'];
const roof = (scope) => ROOF_SITES.filter((s) => scope.businesses.includes(s));
const raw = (id) => queryOne(`select *, job_date::text as job_date, site_visit_on::text as site_visit_on, job_time::text as job_time from jobs where id = $1`, [id]);
const stateOf = (j) => Object.fromEntries(STATE.map((k) => [k, j[k] instanceof Date ? j[k].toISOString() : j[k] ?? null]));
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* Where a card may go from each stage, and what each move changes. $2 is
   the date and $3 the time, when the move takes them. */
const MOVES = {
  visit: { from: ['quoted'], needs: 'date', sets: [`status = 'quoted'`, 'site_visit_on = $2::date', 'visit_done_at = null', 'won_at = null'] },
  quoted: { from: ['visit', 'accepted'], sets: [`status = 'quoted'`, 'visit_done_at = coalesce(visit_done_at, now())', 'won_at = null'] },
  accepted: { from: ['visit', 'quoted', 'booked'], sets: [`status = 'quoted'`, 'won_at = coalesce(won_at, now())', 'visit_done_at = coalesce(visit_done_at, now())', 'started_at = null'] },
  booked: { from: ['visit', 'quoted', 'accepted', 'in_progress'], needs: 'date',
    sets: [`status = 'booked'`, 'job_date = $2::date', 'date_set = true', 'job_time = coalesce($3::time, job_time)', 'started_at = null', 'won_at = coalesce(won_at, quote_accepted_at, now())'] },
  in_progress: { from: ['booked', 'done'], sets: [`status = 'booked'`, 'started_at = coalesce(started_at, now())', `job_date = least(job_date, (now() at time zone 'Europe/London')::date)`] },
  done: { from: ['booked', 'in_progress'], sets: [`status = 'completed'`, 'started_at = coalesce(started_at, now())'] },
  lost: { from: ['visit', 'quoted', 'accepted', 'booked'], sets: [`status = case when status = 'booked' then 'cancelled' else 'declined' end`] }
};

async function write(res, scope, id, sets, params, action) {
  const before = await raw(id);
  if (!before || !roof(scope).includes(before.site)) return json(res, 404, { ok: false, error: 'not_found' });
  if (sets.length) await query(`update jobs set ${sets.join(', ')}, updated_at = now() where id = $1`, [id, ...params]);
  const after = await raw(id);
  await record({ scope, business: before.site, entity: 'job', entityId: id, action, before: stateOf(before), after: stateOf(after) });
  return json(res, 200, { ok: true, card: await roofCard(id, roof(scope)), job: await presented(id, scope, before.site), undo: { op: 'restore', id, state: stateOf(before) } });
}

/* The job as the job screen draws it, for writes that change its costs. */
async function presented(id, scope, site) {
  return forViewer(await present(await queryOne('select * from jobs where id = $1', [id]), await businessFor(site)), scope);
}

const bad = (res, message, key = 'stage') => json(res, 400, { ok: false, error: 'bad_' + key, message });
const iso = (v) => (v == null || v === '' ? null : (Number.isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString()));
const dateOrNull = (v) => (v == null || v === '' ? null : ISO.test(String(v).slice(0, 10)) ? String(v).slice(0, 10) : undefined);

async function change(res, scope, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: 'bad_id' });
  const card = await roofCard(id, roof(scope));
  if (!card) return json(res, 404, { ok: false, error: 'not_found' });
  const date = str(body.date, 10) || null;
  if (date && !ISO.test(date)) return bad(res, 'Enter a date as YYYY-MM-DD.', 'date');

  if (body.op === 'stage') {
    const move = MOVES[body.to];
    if (card.frozen || card.status === 'paid') return bad(res, 'This job is paid and its payout is frozen, so its stage cannot move from here.');
    if (!move || !move.from.includes(card.stage)) return bad(res, `A job cannot go from ${card.stage.replace('_', ' ')} to ${String(body.to).replace('_', ' ')} from here.`);
    if (body.to === 'quoted' && card.acceptedOnline) return bad(res, 'The customer accepted this quote online, so it stays accepted.');
    const time = str(body.time, 5) || null;
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad(res, 'Enter a time as HH:MM.', 'time');
    const useDate = date || (body.to === 'booked' && card.jobDate && card.jobDate >= card.today ? card.jobDate : null);
    if (move.needs === 'date' && !useDate) return bad(res, body.to === 'visit' ? 'Choose the day of the site visit.' : 'Choose the start date.', 'date');
    const params = move.needs === 'date' ? (body.to === 'booked' ? [useDate, time] : [useDate]) : [];
    return write(res, scope, id, [...move.sets, 'stage_at = now()'], params, 'roofing_stage');
  }
  if (body.op === 'date') {
    if (!date) return bad(res, 'Choose the new start date.', 'date');
    if (!['booked', 'in_progress', 'done', 'paid', 'reviewed'].includes(card.stage)) return bad(res, 'Only booked work has a start date to move.', 'date');
    return write(res, scope, id, ['job_date = $2::date', 'date_set = true'], [date], 'roofing_date');
  }
  if (body.op === 'finish') {
    if (body.step !== 'google' || typeof body.on !== 'boolean') return bad(res, 'Only the Google post is ticked here; the rest happen by doing them.', 'step');
    return write(res, scope, id, ['google_posted_at = case when $2::boolean then coalesce(google_posted_at, now()) else null end'], [body.on], 'roofing_finish');
  }
  if (body.op === 'restore') {
    const s = body.state || {};
    const vals = [
      ['quoted', 'booked', 'completed', 'declined', 'cancelled'].includes(s.status) ? s.status : undefined,
      dateOrNull(s.job_date), s.job_time == null || /^\d{2}:\d{2}/.test(s.job_time) ? (s.job_time ? String(s.job_time).slice(0, 5) : null) : undefined,
      typeof s.date_set === 'boolean' || s.date_set == null ? s.date_set ?? null : undefined, dateOrNull(s.site_visit_on), iso(s.visit_done_at), iso(s.won_at), iso(s.started_at), iso(s.stage_at), iso(s.google_posted_at)
    ];
    if (vals.some((v) => v === undefined)) return json(res, 400, { ok: false, error: 'bad_state' });
    const casts = ['', '::date', '::time', '::boolean', '::date', '::timestamptz', '::timestamptz', '::timestamptz', '::timestamptz', '::timestamptz'];
    /* A job always has a date; restoring one that had none keeps today's. */
    /* An undo saved before date_set was kept leaves it as it is. */
    const sets = STATE.map((c, i) => (['job_date', 'date_set'].includes(c) ? `${c} = coalesce($${i + 2}${casts[i]}, ${c})` : `${c} = $${i + 2}${casts[i]}`));
    return write(res, scope, id, sets, vals, 'roofing_restore');
  }
  if (body.op === 'task') {
    const done = await saveTask(id, body, scope.personId);
    if (done.error) return bad(res, done.error, 'task');
    await record({ scope, business: card.site, entity: 'job', entityId: id, action: 'roofing_task', before: null, after: { kind: body.kind, status: body.status ?? null } });
    return json(res, 200, { ok: true, card: await roofCard(id, roof(scope)), plan: await planOf(id), job: await presented(id, scope, card.site) });
  }
  if (body.op === 'plan') {
    const days = body.expectedDays == null || body.expectedDays === '' ? null : Number(body.expectedDays);
    if (days != null && !(days > 0 && days <= 60)) return bad(res, 'Expected days is between half a day and sixty.', 'plan');
    await query('update jobs set expected_days = $2, updated_at = now() where id = $1', [id, days]);
    return json(res, 200, { ok: true, card: await roofCard(id, roof(scope)), plan: await planOf(id) });
  }
  return json(res, 400, { ok: false, error: 'unknown_op' });
}

/* The forecast on each booked card in the coming week, best effort. */
async function withWeather(cards, today) {
  const end = addDays(today, 7);
  const near = cards.filter((c) => ['booked', 'in_progress'].includes(c.stage) && c.jobDate && c.postcode && c.jobDate <= end);
  if (!near.length) return cards;
  let map;
  try { map = await forecasts(near.map((c) => c.postcode), { budgetMs: 2500 }); } catch { return cards; }
  for (const c of near) {
    const days = workingDays(c.jobDate < today ? today : c.jobDate, c.expectedDays || 1).filter((d) => d <= end);
    c.weather = days.map((d) => dayOf(map, c.postcode, d)).filter(Boolean);
    const bad = c.weather.find((w) => w.warn);
    if (bad) c.badges.push('weather');
  }
  return cards;
}

async function read(req, res, scope) {
  const url = new URL(req.url, 'http://localhost');
  const sites = requestedSites(scope, url.searchParams).filter((s) => ROOF_SITES.includes(s));
  const view = url.searchParams.get('view') || 'board';
  const today = londonToday();
  if (view === 'week') {
    const from = str(url.searchParams.get('from'), 10) || today;
    if (!ISO.test(from)) return json(res, 400, { ok: false, error: 'bad_date' });
    const d = new Date(`${from}T12:00:00Z`);
    const monday = addDays(from, -((d.getUTCDay() + 6) % 7));
    const days = [0, 1, 2, 3, 4, 5].map((n) => addDays(monday, n));
    const cards = await withWeather(await roofWeek(sites, monday, days[5]), today);
    for (const c of cards) c.days = c.jobDate ? workingDays(c.jobDate, c.expectedDays || 1).filter((x) => days.includes(x)) : [];
    return json(res, 200, { ok: true, today, from: monday, days, jobs: cards.filter((c) => c.days.length) });
  }
  if (view === 'job') {
    const id = Number(url.searchParams.get('id'));
    const card = Number.isInteger(id) ? await roofCard(id, sites) : null;
    if (!card) return json(res, 404, { ok: false, error: 'not_found' });
    const job = await presented(id, scope, card.site);
    const ready = job.messages.ready;
    return json(res, 200, { ok: true, card: (await withWeather([card], today))[0], plan: await planOf(id),
      messages: { rating: ready.rating, yearly: ready.yearly, review: ready.review, quote: ready.quote }, sent: job.messages.sent });
  }
  const data = await roofBoard(sites);
  await withWeather(data.jobs, today);
  return json(res, 200, { ok: true, today, ...data });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  try {
    if (req.method === 'GET') return await read(req, res, scope);
    return await change(res, scope, await readJson(req));
  } catch (err) {
    console.error('roofing request failed:', err.message);
    json(res, 500, { ok: false, error: 'roofing_failed' });
  }
}
