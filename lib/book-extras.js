/**
 * Extras on a survey booked from Scheduling (the owners' choice, 8 Nov 2026):
 * the booking form ticks the add-ons from the one price list
 * (content/prices.js), already ticked with what the customer chose online,
 * and shows the total, which can be changed. Whatever is ticked is written on
 * the job as a note, so the surveyor knows to do it, and the price is the
 * survey plus the extras unless a price was typed.
 */
import { query, queryOne } from './db.js';
import { EXTRAS } from '../content/prices.js';

/** The add-ons a survey can take, at their with-a-survey price. */
export const ADDABLE = EXTRAS.filter((x) => x.addable).map((x) => ({ key: x.key, name: x.name, price: x.withSurvey, from: Boolean(x.from) }));

const NOTE = /^Extras: .*$/m;

export async function applyExtras(jobId, { surveyType, extras, pricePounds }) {
  const picked = ADDABLE.filter((x) => Array.isArray(extras) && extras.includes(x.key));
  const typed = Number(pricePounds);
  let pence;
  if (pricePounds !== undefined && pricePounds !== null && pricePounds !== '' && Number.isFinite(typed) && typed >= 0) {
    pence = Math.round(typed * 100);
  } else {
    const rate = surveyType ? await queryOne('select price_pence from job_rates where key = $1', [surveyType]) : null;
    if (!rate) return null;
    pence = Number(rate.price_pence) + picked.reduce((t, x) => t + x.price * 100, 0);
  }
  const job = await queryOne('select note from jobs where id = $1', [jobId]);
  const line = picked.length ? `Extras: ${picked.map((x) => x.name.toLowerCase()).join(', ')}` : '';
  /* One extras line, replaced rather than repeated if the booking is redone. */
  const old = (job && job.note) || '';
  const note = old.match(NOTE) ? old.replace(NOTE, line).trim() : [old, line].filter(Boolean).join('\n');
  await query('update jobs set survey_price_pence = $2, note = $3 where id = $1', [jobId, pence, note || null]);
  return { pricePence: pence, extras: picked.map((x) => x.name) };
}
