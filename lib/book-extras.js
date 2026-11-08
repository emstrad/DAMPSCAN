/**
 * Extras on a booked survey (the owners' choice, 8 Nov 2026): a damp survey
 * is always booked, and the add-ons from the one price list (content/prices.js)
 * only ever go on top of it. Whatever way a survey is booked (Scheduling, the
 * job pop-up, the survey board, ChatGPT), the extras are kept on the job
 * (jobs.extras), written on its note so the surveyor sees them on Route and
 * the pop-up, and add their time on site (jobs.extra_minutes, EXTRA_MINUTES
 * each) to every drive check, free time and report deadline. The surveyor's
 * fee stays the survey's (the owners' choice).
 */
import { query, queryOne } from './db.js';
import { EXTRAS, EXTRA_MINUTES } from '../content/prices.js';

/** The add-ons a survey can take, at their with-a-survey price. */
export const ADDABLE = EXTRAS.filter((x) => x.addable).map((x) => ({ key: x.key, name: x.name, price: x.withSurvey, from: Boolean(x.from) }));

const NOTE = /^Extras: .*$/m;
export const pickedExtras = (keys) => ADDABLE.filter((x) => Array.isArray(keys) && keys.includes(x.key));
/** The extras' price in pence. */
export const extrasPence = (keys) => pickedExtras(keys).reduce((t, x) => t + x.price * 100, 0);

/** Keeps these extras on the job: the list, the note line and the time they add. */
export async function markExtras(jobId, keys) {
  const picked = pickedExtras(keys);
  const job = await queryOne('select note from jobs where id = $1', [jobId]);
  if (!job) return [];
  const line = picked.length ? `Extras: ${picked.map((x) => x.name.toLowerCase()).join(', ')}` : '';
  /* One extras line, replaced rather than repeated if the booking is redone. */
  const old = job.note || '';
  const note = old.match(NOTE) ? old.replace(NOTE, line).trim() : [old, line].filter(Boolean).join('\n');
  await query('update jobs set extras = $2, extra_minutes = $3, note = $4 where id = $1',
    [jobId, picked.map((x) => x.key), picked.length * EXTRA_MINUTES, note || null]);
  return picked;
}

/** The Scheduling form's ticks: the extras kept, and the price (survey plus extras, or a typed one). */
export async function applyExtras(jobId, { surveyType, extras, pricePounds }) {
  const picked = await markExtras(jobId, extras);
  const typed = Number(pricePounds);
  let pence;
  if (pricePounds !== undefined && pricePounds !== null && pricePounds !== '' && Number.isFinite(typed) && typed >= 0) {
    pence = Math.round(typed * 100);
  } else {
    const rate = surveyType ? await queryOne('select price_pence from job_rates where key = $1', [surveyType]) : null;
    if (!rate) return null;
    pence = Number(rate.price_pence) + extrasPence(extras);
  }
  await query('update jobs set survey_price_pence = $2 where id = $1', [jobId, pence]);
  return { pricePence: pence, extras: picked.map((x) => x.name) };
}
