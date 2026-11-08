/**
 * Changing a booked ATi or DampScan survey's type and price after booking
 * (booked as a full house at £295 that should be £495, say). The same for
 * the job pop-up and ChatGPT: a survey type from the rate card sets its price
 * and the surveyor's fee; a price in pounds overrides the price alone. Managers
 * only. Logged in the customer's history with what it was before.
 */
import { queryOne } from './db.js';
import { record } from './audit.js';
import { findRate } from './job-amounts.js';
import { extrasPence } from './book-extras.js';

const DAMP = ['dampscan', 'ati-london'];
const pounds = (p) => `£${(Number(p) / 100).toFixed(Number(p) % 100 ? 2 : 0)}`;
const manages = (scope, site) => scope.isAdmin || (scope.levels || {})[site] === 'manage';

export async function changeSurvey(scope, jobId, { surveyType, pricePounds } = {}) {
  const j = await queryOne(`select j.id, j.site, j.survey_type, j.survey_price_pence, j.surveyor_fee_pence, j.extras, r.label
      from jobs j left join job_rates r on r.key = j.survey_type where j.id = $1`, [jobId]);
  if (!j || !DAMP.includes(j.site) || !scope.businesses.includes(j.site)) return { error: 'No survey found.', status: 404 };
  if (!manages(scope, j.site)) return { error: 'Only a manager can change the survey or its price.', status: 403 };
  const said = String(surveyType || '').trim();
  const typed = pricePounds !== undefined && pricePounds !== null && String(pricePounds).trim() !== '';
  if (!said && !typed) return { error: 'Say the survey, the price, or both.', status: 400 };
  let type = j.survey_type; let label = j.label; let price = Number(j.survey_price_pence); let fee = Number(j.surveyor_fee_pence);
  if (said) {
    const { rate, rates } = await findRate(said);
    if (!rate) return { error: `Unknown survey "${said}". The surveys are: ${rates.map((r) => r.label).join(', ')}.`, status: 400 };
    /* The extras booked on top stay on top: a new size never drops them. */
    type = rate.key; label = rate.label; price = Number(rate.price_pence) + extrasPence(j.extras); fee = Number(rate.surveyor_fee_pence);
  }
  if (typed) {
    const p = Math.round(Number(pricePounds) * 100);
    if (!Number.isFinite(p) || p < 0 || p > 1000000) return { error: 'Give the price in pounds, e.g. 495.', status: 400 };
    price = p;
  }
  await queryOne('update jobs set survey_type = $2, survey_price_pence = $3, surveyor_fee_pence = $4, updated_at = now() where id = $1 returning id', [jobId, type, price, fee]);
  const was = `${j.label || j.survey_type || 'One off'} at ${pounds(j.survey_price_pence)}`;
  const now = `${label || type || 'One off'} at ${pounds(price)}`;
  await record({ scope, business: j.site, entity: 'job', entityId: jobId, action: 'survey_change',
    before: { surveyType: j.survey_type, surveyPricePence: Number(j.survey_price_pence) },
    after: { surveyType: type, surveyPricePence: price, said: `Survey changed to ${now} (was ${was})` } });
  return { ok: true, survey: label || type, pricePence: price, depositPence: Math.ceil(price / 2), said: `Survey changed to ${now} (was ${was}).` };
}
