/**
 * Who gets what on one survey (the owner, 17 Nov 2026): when the waterfall
 * (lib/splits.js) is not how a survey was really shared, say Scott and Tom
 * both went, an owner moves a set amount from one person to another on that
 * survey alone. The total never changes; nothing is edited: a move is added,
 * or taken back with who and when, and each is a line in the customer's
 * history. Pay, the statements, Overview, Money and Week read the moves
 * (lib/pay-book.js), and so does Money and rates (lib/job-totals.js).
 */
import { query, queryOne } from './db.js';
import { shareOf, surveyRow, splitSettings, NAMES } from './pay-book.js';

export const MOVE_WHO = ['scott', 'tom', 'ben', 'ronnie'];
const has = (split, k) => (split.people.find((p) => p.key === k) || { now: 0 }).now;
const pounds = (p) => '£' + (p / 100).toFixed(2).replace(/\.00$/, '');
const note = (jobId, by, text) => query(
  `update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'by', $2::text, 'how', 'note', 'note', $3::text)) where id = $1`,
  [jobId, by, text]);

/** The survey's split as worked out, the moves on it, and what each person ends up with. */
export async function jobSplit(jobId) {
  const j = await surveyRow(jobId);
  if (!j || !['dampscan', 'ati-london'].includes(j.site)) return { error: 'Only an ATi or DampScan survey has a split.' };
  const { share } = shareOf(j, await splitSettings());
  const moves = await query(`select id, from_key, to_key, pence, reason, by_name, created_at from job_pay_moves
    where job_id = $1 and removed_at is null order by id`, [jobId]);
  const now = { ...share };
  for (const m of moves) { now[m.from_key] -= Number(m.pence); now[m.to_key] += Number(m.pence); }
  const people = ['tax', ...MOVE_WHO].map((k) => ({ key: k, name: NAMES[k], was: share[k] || 0, now: now[k] || 0 }))
    .filter((p) => p.was || p.now || p.key !== 'ronnie');
  return {
    jobId: Number(jobId), price: Number(j.survey_price_pence), surveyor: j.surveyor, paid: Boolean(j.paid_at), people,
    moves: moves.map((m) => ({ id: Number(m.id), from: m.from_key, to: m.to_key, pence: Number(m.pence), reason: m.reason, by: m.by_name, at: m.created_at }))
  };
}

/** Moves a set amount from one person to another on this survey; never more than they have on it. */
export async function addMove({ jobId, from, to, pence, reason }, by) {
  pence = Math.round(Number(pence));
  if (!MOVE_WHO.includes(from) || !MOVE_WHO.includes(to) || from === to) return { error: 'Pick who it comes from and who it goes to.' };
  if (!(pence > 0)) return { error: 'Enter the amount to move.' };
  const why = String(reason || '').trim().slice(0, 200);
  if (!why) return { error: 'Say why, so it makes sense later.' };
  const split = await jobSplit(jobId);
  if (split.error) return split;
  const got = has(split, from);
  if (pence > got) return { error: `${NAMES[from]} has ${pounds(Math.max(0, got))} on this survey.` };
  const row = await queryOne(`insert into job_pay_moves (job_id, from_key, to_key, pence, reason, by_name) values ($1, $2, $3, $4, $5, $6) returning id`,
    [jobId, from, to, pence, why, by]);
  await note(jobId, by, `Who gets what: ${pounds(pence)} moved from ${NAMES[from]} to ${NAMES[to]} (${why}).`);
  return { id: Number(row.id), split: await jobSplit(jobId) };
}

/** Takes a move back (kept, marked removed, with who and when). */
export async function removeMove(id, by) {
  const was = await queryOne('select job_id, to_key, pence from job_pay_moves where id = $1 and removed_at is null', [id]);
  if (!was) return { error: 'That move has already been taken back.' };
  /* Taking it back must not leave anyone below nothing (a later move may have passed it on). */
  const split = await jobSplit(was.job_id);
  const left = has(split, was.to_key) - Number(was.pence);
  if (left < 0) return { error: `${NAMES[was.to_key]} has passed it on: take back the later move first.` };
  const m = await queryOne(`update job_pay_moves set removed_at = now(), removed_by = $2 where id = $1 and removed_at is null
    returning job_id, from_key, to_key, pence`, [id, by]);
  if (!m) return { error: 'That move has already been taken back.' };
  await note(m.job_id, by, `Who gets what: took back ${pounds(Number(m.pence))} from ${NAMES[m.from_key]} to ${NAMES[m.to_key]}.`);
  return { split: await jobSplit(m.job_id) };
}
