/**
 * /api/admin/scheduling  (lib/scheduling.js)
 *
 *   GET                                      the board and the free times
 *   POST {op:'move', kind, id, to}            new | contacted | waiting
 *   POST {op:'log', kind, id, how, note}      a call, email, text or note
 *   POST {op:'wanted', kind, id, text}        the times the customer asked for
 *   POST {op:'book', kind, id, date, time, surveyor, surveyType[, force]}
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
import { board, cardRow, moveCard, logContact, setWanted, clashFor, STAGES } from '../../scheduling.js';
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
    if (req.method === 'GET') {
      const rates = await query('select key, label from job_rates order by position, key');
      return json(res, 200, { ok: true, today: londonToday(), rates, ...(await board(scope.businesses, londonToday())) });
    }
    const body = await readJson(req);
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
      await setWanted(kind, id, (str(body.text, 300) || '').trim());
      await audit('sched_wanted', { said: `Times asked for: ${(str(body.text, 300) || '').trim() || 'cleared'}` });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'book') {
      const date = str(body.date, 10);
      const time = str(body.time, 5);
      const surveyor = String(body.surveyor || '').toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return json(res, 400, { ok: false, error: 'Pick a day and a time.' });
      if (!SURVEYORS.includes(surveyor)) return json(res, 400, { ok: false, error: 'Pick who is going.' });
      if (body.force !== true) {
        const clash = await clashFor(surveyor, date, time, kind === 'job' ? id : null);
        if (clash) return json(res, 400, { ok: false, clash, error: clash });
      }
      let out;
      if (kind === 'lead') {
        const l = await queryOne('select site, first_name, postcode, phone, email from leads where id = $1', [id]);
        out = await callRoute(jobs, scope, { method: 'POST', url: '/api/admin/jobs', body: {
          site: l.site, leadId: id, surveyor, surveyType: str(body.surveyType, 60), jobDate: date, jobTime: time, status: 'booked',
          customerName: l.first_name, customerPostcode: l.postcode, ...(l.phone ? { customerPhone: l.phone } : {}), ...(l.email ? { customerEmail: l.email } : {}) } });
      } else {
        out = await callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, jobDate: date, jobTime: time, awaitingAgent: false } });
        if (out.status < 400) await query('update jobs set surveyor = $2, sched_stage = null where id = $1', [id, surveyor]);
      }
      if (out.status >= 400 || (out.data && out.data.ok === false)) return json(res, out.status >= 400 ? out.status : 400, out.data || { ok: false });
      await audit('sched_book', { said: `Booked from Scheduling for ${date} ${time} with ${surveyor}` });
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { ok: false, error: 'unknown_op' });
  } catch (err) {
    console.error('scheduling request failed:', err.message);
    json(res, 500, { ok: false, error: 'scheduling_failed' });
  }
}
