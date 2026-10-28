/**
 * /api/admin/scheduling  (lib/scheduling.js)
 *
 *   GET ?card=lead:12                         one customer's history (lib/correspondence.js)
 *   GET [?postcode=&day=&week=]              the board, the free times (with real
 *                                            travel when the caller's postcode is given),
 *                                            and the dispatch day and week (lib/dispatch.js)
 *   POST {op:'move', kind, id, to}            new | contacted | waiting
 *   POST {op:'log', kind, id, how, note}      a call, email, text or note
 *   POST {op:'wanted', kind, id, text}        the times the customer asked for
 *   POST {op:'pencil', kind, id, date, time, surveyor[, force]}  hold a time 48h
 *   POST {op:'unpencil', kind, id}
 *   POST {op:'link', kind:'job', id, leadId}   the same person's enquiry, linked
 *   POST {op:'close_dup', kind:'lead', id}       a second enquiry from the same person
 *   POST {op:'close', kind:'lead', id, reason}    an enquiry that will not become a survey
 *   POST {op:'book', kind, id, date, time, surveyor, surveyType[, force]}
 *   POST {op:'create', site, name, postcode, phone, email[, address, note, force]}  a caller, as a card
 *
 * Booking an enquiry makes the job through the Jobs route; booking an
 * undated job sets its day and time through the client card's route, so
 * both are checked, audited and alerted exactly as everywhere else. A time
 * outside the surveyor's hours or next to another survey is refused with
 * the reason unless force is sent (the person has checked).
 */
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope } from '../../access.js';
import { londonToday } from '../../pipeline.js';
import { record } from '../../audit.js';
import { query, queryOne } from '../../db.js';
import { SURVEYORS } from '../../splits.js';
import { workOnly } from '../../work-only.js';
import { callRoute } from '../../mcp/shared.js';
import { board, cardRow, moveCard, logContact, setWanted, clashFor, STAGES, DAMP } from '../../scheduling.js';
import { freeSlots } from '../../availability.js';
import { day as dispatchDay, week as dispatchWeek } from '../../dispatch.js';
import { bestFits } from '../../best-fit.js';
import { tellPencil } from '../../surveyor-alerts.js';
import { correspondence } from '../../correspondence.js';
import { setPencil, clearPencil, bumpOthers } from '../../pencils.js';
import { linkLead } from '../../duplicates.js';
import { createCard } from '../../sched-create.js';
import jobs from './jobs.js';
import clients from './clients.js';

export const config = { runtime: 'nodejs' };

const HOW = { call: 'Called', email: 'Emailed', text: 'Texted', note: 'Note' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  /* Enquiry phone numbers and emails are for managers, not the work login. */
  if (workOnly(scope)) return json(res, 403, { ok: false, error: 'forbidden' });
  try {
    if (req.method === 'GET' && new URL(req.url, 'http://localhost').searchParams.get('card')) {
      /* One customer's whole history, for the Scheduling pop-up. */
      const [k, n] = String(new URL(req.url, 'http://localhost').searchParams.get('card')).split(':');
      if (!(await cardRow(k, Number(n), scope.businesses))) return json(res, 404, { ok: false, error: 'not_found' });
      return json(res, 200, { ok: true, entries: await correspondence(k, Number(n), scope) });
    }
    if (req.method === 'GET') {
      const rates = await query('select key, label, price_pence as "pricePence" from job_rates where active order by position, key');
      const params = new URL(req.url, 'http://localhost').searchParams;
      const postcode = (params.get('postcode') || '').slice(0, 10) || null;
      const ISO = /^\d{4}-\d{2}-\d{2}$/;
      const onDay = ISO.test(params.get('day') || '') ? params.get('day') : londonToday();
      const weekFrom = ISO.test(params.get('week') || '') ? params.get('week') : onDay;
      const sites = scope.businesses.filter((x) => DAMP.includes(x));
      const dispatch = { day: await dispatchDay(sites, onDay), week: await dispatchWeek(sites, weekFrom) };
      const free = await freeSlots({ today: londonToday(), days: 14, sites: DAMP, perSurveyor: true, postcode });
      const b = await board(scope.businesses, londonToday());
      /* Where each customer is and the free times nearest work already planned. */
      const { fits } = await bestFits(b.cards, sites, londonToday());
      for (const c of b.cards) Object.assign(c, fits.get(c.kind + ':' + c.id) || { at: null, best: [] });
      return json(res, 200, { ok: true, today: londonToday(), rates, free, dispatch, ...b });
    }
    const body = await readJson(req);
    if (body.op === 'create') {
      const made = await createCard(scope, body, scope.name || 'Staff');
      if (made.error) return json(res, 400, { ok: false, error: made.error });
      if (made.same) return json(res, 200, { ok: true, same: made.same });
      await record({ scope, business: body.site, entity: 'lead', entityId: made.id, action: 'sched_create', after: { said: 'Added by hand from a phone call', group: 'other' } });
      return json(res, 200, { ok: true, kind: made.kind, id: made.id });
    }
    const kind = body.kind;
    const id = Number(body.id);
    const row = await cardRow(kind, id, scope.businesses);
    if (!row) return json(res, 404, { ok: false, error: 'not_found' });
    const audit = (action, after) => record({ scope, business: row.site, entity: kind === 'lead' ? 'lead' : 'job', entityId: id, action, before: null, after });

    if (body.op === 'move') {
      if (!STAGES.includes(body.to) || (kind === 'job' && body.to === 'new')) return json(res, 400, { ok: false, error: 'bad_stage' });
      await moveCard(kind, id, body.to);
      await audit('sched_move', { stage: body.to });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'log') {
      if (!HOW[body.how]) return json(res, 400, { ok: false, error: 'bad_how' });
      const note = (str(body.note, 500) || '').trim();
      await logContact(kind, id, { at: new Date().toISOString(), by: scope.name || 'Staff', how: body.how, note });
      await audit('sched_log', { said: `${HOW[body.how]}${note ? ': ' + note : ''}` });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'wanted') {
      await setWanted(kind, id, (str(body.text, 300) || '').trim(), scope.name);
      await audit('sched_wanted', { said: `Times asked for: ${(str(body.text, 300) || '').trim() || 'cleared'}` });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'link' && kind === 'job') {
      const out = await linkLead(scope, id, Number(body.leadId));
      if (out.error) return json(res, 400, { ok: false, error: out.error });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'close' && kind === 'lead') {
      const reason = (str(body.reason, 80) || 'Other').trim();
      await query('update leads set closed_at = now(), closed_reason = $2 where id = $1 and closed_at is null', [id, reason]);
      await audit('close', { said: `Closed from Scheduling: ${reason}` });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'close_dup' && kind === 'lead') {
      await query("update leads set closed_at = now(), closed_reason = 'duplicate' where id = $1 and closed_at is null", [id]);
      await audit('close', { said: 'Closed as a duplicate from Scheduling' });
      return json(res, 200, { ok: true });
    }
    /* Off the diary, not deleted: the card goes back to Waiting for time with
       its history, and the surveyor and the gap are told (lib/activity.js). */
    if (body.op === 'unbook' && kind === 'job') {
      const was = await queryOne(`update jobs set date_set = false, job_time = null, sched_stage = 'waiting' where id = $1 and status = 'booked' and date_set
          returning to_char(job_date, 'Dy DD Mon') as d`, [id]);
      if (!was) return json(res, 400, { ok: false, error: 'Only a booked survey can be unbooked.' });
      await logContact(kind, id, { at: new Date().toISOString(), by: scope.name || 'Staff', how: 'note', note: `Unbooked from ${was.d}. Waiting for a new time.` }, { moveOn: false });
      await audit('sched_unbook', { said: `Unbooked from ${was.d}` });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'unpencil') {
      await clearPencil(kind, id);
      await audit('sched_unpencil', { said: 'Pencilled time taken off' });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'book' || body.op === 'pencil') {
      const date = str(body.date, 10);
      const time = str(body.time, 5);
      const surveyor = String(body.surveyor || '').toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return json(res, 400, { ok: false, error: 'Pick a day and a time.' });
      if (!SURVEYORS.includes(surveyor)) return json(res, 400, { ok: false, error: 'Pick who is going.' });
      const card = kind === 'lead'
        ? await queryOne('select postcode, false as agent from leads where id = $1', [id])
        : await queryOne('select customer_postcode as postcode, awaiting_agent as agent from jobs where id = $1', [id]);
      if (body.force !== true) {
        const clash = await clashFor(surveyor, date, time, kind === 'job' ? id : null, card.postcode);
        if (clash) return json(res, 400, { ok: false, clash, error: clash });
      }
      if (body.op === 'pencil') {
        /* A buyer waiting on the agent is held until someone lets it go. */
        const held = await setPencil(kind, id, { date, time, surveyor, by: scope.name || 'Staff', byHand: Boolean(card.agent), forced: body.force === true });
        await audit('sched_pencil', { said: `Pencilled in for ${date} ${time} with ${surveyor}` });
        const who = await queryOne(`select ${kind === 'lead' ? 'first_name' : 'customer_name'} as n, ${kind === 'lead' ? 'postcode' : 'customer_postcode'} as p from ${kind === 'lead' ? 'leads' : 'jobs'} where id = $1`, [id]);
        await tellPencil({ surveyor, name: who && who.n, postcode: who && who.p, date, time, by: scope.name }).catch(() => {});
        return json(res, 200, { ok: true, byHand: Boolean(card.agent), ...held });
      }
      let out;
      if (kind === 'lead') {
        const l = await queryOne('select site, first_name, postcode, phone, email from leads where id = $1', [id]);
        out = await callRoute(jobs, scope, { method: 'POST', url: '/api/admin/jobs', body: {
          site: l.site, leadId: id, surveyor, surveyType: str(body.surveyType, 60), jobDate: date, jobTime: time, status: 'booked', force: body.force === true,
          customerName: l.first_name, customerPostcode: l.postcode, ...(l.phone ? { customerPhone: l.phone } : {}), ...(l.email ? { customerEmail: l.email } : {}) } });
      } else {
        out = await callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, jobDate: date, jobTime: time, awaitingAgent: false, force: body.force === true } });
        if (out.status < 400) await query('update jobs set surveyor = $2, sched_stage = null where id = $1', [id, surveyor]);
      }
      if (out.status >= 400 || (out.data && out.data.ok === false)) return json(res, out.status >= 400 ? out.status : 400, out.data || { ok: false });
      await audit('sched_book', { said: `Booked from Scheduling for ${date} ${time} with ${surveyor}` });
      await clearPencil(kind, id);
      const named = (await queryOne(`select ${kind === 'lead' ? 'first_name' : 'customer_name'} as n from ${kind === 'lead' ? 'leads' : 'jobs'} where id = $1`, [id]) || {}).n;
      const bumped = await bumpOthers({ kind, id, surveyor, date, time, bookedName: named });
      return json(res, 200, { ok: true, bumped });
    }
    return json(res, 400, { ok: false, error: 'unknown_op' });
  } catch (err) {
    console.error('scheduling request failed:', err.message);
    json(res, 500, { ok: false, error: 'scheduling_failed' });
  }
}
