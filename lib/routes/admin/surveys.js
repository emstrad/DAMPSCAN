/**
 * /api/admin/surveys: the ATi and DampScan survey board.
 *
 *   GET  ?view=board                       enquiries and every survey, by column
 *   GET  ?view=agents                      estate agents, busiest waiting first
 *   GET  ?view=day&date=&surveyor=         one surveyor's day, in time order
 *   GET  ?view=messages&id=                the confirmation, deposit, chase and remedial words
 *   POST {op:'move', id, to}               a card to the next or previous column
 *   POST {op:'tick', id, what, on}         deposit, paid or report, ticked or not
 *   POST {op:'agent', id, estateAgent, awaitingAgent?}
 *   POST {op:'remedial', id, status, amountPence?}
 *   POST {op:'restore', id, state}         Undo: puts back what a write returned as `undo`
 *
 * Booking itself is the Jobs route (POST /api/admin/jobs), which now also
 * takes the estate agent and the agent wait, so a survey has one way in.
 * Every write here returns the card as it now stands and an `undo` body that
 * puts the facts it changed back exactly, timestamps included, so "paid on
 * the 3rd" is not undone into "paid today".
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { record } from '../../audit.js';
import { calcJob } from '../../splits.js';
import { londonToday } from '../../pipeline.js';
import { DAMP_SITES, REMEDIAL_STATUSES, board, daySheet, surveyById, reportsOwed } from '../../surveys.js';
import { surveyFields, listAgents } from '../../estate-agents.js';
import { surveyMessage, SURVEY_MESSAGE_KINDS } from '../../survey-messages.js';
import { COMPLETE_WHEN_DUE } from './clients.js';

export const config = { runtime: 'nodejs' };

/* The moves a card may make by dragging, and what each one changes. Only to
   a neighbouring column: skipping from booked to paid would tick things
   nobody saw happen. */
const MOVES = {
  'booked>surveyed': [`status = 'completed'`, 'awaiting_agent = false'],
  'surveyed>booked': [`status = 'booked'`],
  'surveyed>paid': ['paid_at = now()', 'deposit_paid_at = coalesce(deposit_paid_at, now())', COMPLETE_WHEN_DUE],
  'paid>surveyed': ['paid_at = null'],
  'paid>sent': ['survey_sent_at = now()'],
  'sent>paid': ['survey_sent_at = null'],
  /* Unticks a report sent before the money came in (sent, not paid). */
  'sent>surveyed': ['survey_sent_at = null']
};
const TICKS = { deposit: 'deposit_paid_at', paid: 'paid_at', report: 'survey_sent_at' };
const STATE = ['status', 'awaiting_agent', 'deposit_paid_at', 'paid_at', 'survey_sent_at', 'remedial_status', 'remedial_quote_pence', 'remedial_pence'];

const damp = (scope) => DAMP_SITES.filter((s) => scope.businesses.includes(s));
const raw = (id) => queryOne('select * from jobs where id = $1', [id]);
const stateOf = (j) => Object.fromEntries(STATE.map((k) => [k, j[k] instanceof Date ? j[k].toISOString() : j[k]]));

/* Pay follows remedial_pence, so a change to it recomputes the payout from
   the rates the job was agreed at, as the Jobs route does on an edit. */
async function repay(id) {
  const j = await raw(id);
  const calc = calcJob({ surveyPence: j.survey_price_pence, surveyorFeePence: j.surveyor_fee_pence, remedialPence: j.remedial_pence,
    surveyor: j.surveyor, taxBp: j.tax_bp, leadBp: j.lead_bp, leadEarner: j.lead_earner, partners: [j.partner_a, j.partner_b] });
  await query('update jobs set pay_scott_pence = $2, pay_tom_pence = $3, pay_ben_pence = $4 where id = $1', [id, calc.pay.scott, calc.pay.tom, calc.pay.ben]);
}

async function write(res, scope, id, sets, params, action) {
  const before = await raw(id);
  if (!before || !damp(scope).includes(before.site)) return json(res, 404, { ok: false, error: 'not_found' });
  if (sets.length) await query(`update jobs set ${sets.join(', ')}, updated_at = now() where id = $1`, [id, ...params]);
  const after = await raw(id);
  if (Number(after.remedial_pence) !== Number(before.remedial_pence)) await repay(id);
  await record({ scope, business: before.site, entity: 'job', entityId: id, action, before: stateOf(before), after: stateOf(after) });
  return json(res, 200, { ok: true, survey: await surveyById(id, damp(scope)), undo: { op: 'restore', id, state: stateOf(before) } });
}

const iso = (v) => (v == null || v === '' ? null : (Number.isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString()));

async function change(res, scope, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: 'bad_id' });
  const current = await surveyById(id, damp(scope));
  if (!current) return json(res, 404, { ok: false, error: 'not_found' });

  if (body.op === 'move') {
    const sets = MOVES[`${current.stage}>${body.to}`];
    if (!sets) return json(res, 400, { ok: false, error: 'bad_move', message: `A survey cannot go from ${current.stage} to ${body.to} in one step.` });
    if (current.stage === 'sent' && current.paid !== (body.to === 'paid')) {
      return json(res, 400, { ok: false, error: 'bad_move', message: current.paid ? 'It is paid: untick the report to put it back to Paid.' : 'It is not paid yet: untick the report to put it back to Surveyed.' });
    }
    if (body.to === 'booked' && current.stage === 'surveyed' && current.date < londonToday()) {
      return json(res, 400, { ok: false, error: 'bad_move', message: 'Its date has passed. Give it a new date to book it again.' });
    }
    return write(res, scope, id, sets, [], 'survey_move');
  }
  if (body.op === 'tick') {
    const col = TICKS[body.what];
    if (!col || typeof body.on !== 'boolean') return json(res, 400, { ok: false, error: 'bad_tick' });
    const sets = [`${col} = case when $2::boolean then coalesce(${col}, now()) else null end`];
    if (body.what === 'paid' && body.on) sets.push('deposit_paid_at = coalesce(deposit_paid_at, now())', COMPLETE_WHEN_DUE);
    return write(res, scope, id, sets, [body.on], 'survey_tick');
  }
  if (body.op === 'agent') {
    const got = await surveyFields({ estateAgent: body.estateAgent, awaitingAgent: body.awaitingAgent });
    if (got.errors) return json(res, 400, { ok: false, errors: got.errors });
    return write(res, scope, id, got.columns.map((c, i) => `${c} = $${i + 2}`), got.values, 'survey_agent');
  }
  if (body.op === 'remedial') {
    if (!REMEDIAL_STATUSES.includes(body.status)) return json(res, 400, { ok: false, error: 'bad_status' });
    const amount = body.amountPence == null || body.amountPence === '' ? null : Math.round(Number(body.amountPence));
    if (amount != null && !(amount >= 0)) return json(res, 400, { ok: false, errors: { amountPence: 'Enter the amount in pounds.' } });
    /* Only won work is money the payout counts; a quote is a hope. */
    const sets = ['remedial_status = $2', 'remedial_quote_pence = coalesce($3::integer, remedial_quote_pence)'];
    if (body.status === 'won') sets.push('remedial_pence = coalesce($3::integer, remedial_quote_pence, remedial_pence)');
    if (body.status === 'declined' || body.status === 'none') sets.push('remedial_pence = 0');
    return write(res, scope, id, sets, [body.status, amount], 'survey_remedial');
  }
  if (body.op === 'restore') {
    const s = body.state || {};
    const vals = [
      ['booked', 'completed'].includes(s.status) ? s.status : undefined,
      typeof s.awaiting_agent === 'boolean' ? s.awaiting_agent : undefined,
      iso(s.deposit_paid_at), iso(s.paid_at), iso(s.survey_sent_at),
      REMEDIAL_STATUSES.includes(s.remedial_status) ? s.remedial_status : undefined,
      s.remedial_quote_pence == null ? null : Math.max(0, Math.round(Number(s.remedial_quote_pence))) || 0,
      Math.max(0, Math.round(Number(s.remedial_pence))) || 0
    ];
    if (vals.some((v) => v === undefined)) return json(res, 400, { ok: false, error: 'bad_state' });
    return write(res, scope, id, STATE.map((c, i) => `${c} = $${i + 2}`), vals, 'survey_restore');
  }
  return json(res, 400, { ok: false, error: 'unknown_op' });
}

async function read(req, res, scope) {
  const url = new URL(req.url, 'http://localhost');
  const sites = requestedSites(scope, url.searchParams).filter((s) => DAMP_SITES.includes(s));
  const view = url.searchParams.get('view') || 'board';
  if (view === 'agents') {
    const agents = await listAgents(sites);
    const top = [...agents].filter((a) => a.yearJobs).sort((a, b) => b.yearJobs - a.yearJobs).slice(0, 5);
    return json(res, 200, { ok: true, agents, top: top.map((a) => ({ id: a.id, name: a.name, branch: a.branch, yearJobs: a.yearJobs })) });
  }
  if (view === 'day') {
    const date = str(url.searchParams.get('date'), 10) || londonToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { ok: false, error: 'bad_date' });
    const surveyor = (str(url.searchParams.get('surveyor'), 20) || '').toLowerCase() || null;
    return json(res, 200, { ok: true, date, surveyor, surveys: await daySheet(sites, date, surveyor) });
  }
  if (view === 'reports') return json(res, 200, { ok: true, surveys: await reportsOwed(sites) });
  if (view === 'messages') {
    const s = await surveyById(Number(url.searchParams.get('id')), sites);
    if (!s) return json(res, 404, { ok: false, error: 'not_found' });
    const messages = Object.fromEntries(SURVEY_MESSAGE_KINDS.map((k) => [k, surveyMessage(k, s)]).filter(([, m]) => m));
    return json(res, 200, { ok: true, survey: s, messages });
  }
  return json(res, 200, { ok: true, today: londonToday(), ...(await board(sites)) });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  try {
    if (req.method === 'GET') return await read(req, res, scope);
    return await change(res, scope, await readJson(req));
  } catch (err) {
    console.error('surveys request failed:', err.message);
    json(res, 500, { ok: false, error: 'surveys_failed' });
  }
}
