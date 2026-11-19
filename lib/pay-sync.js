/**
 * Keeps each damp survey's stored split (jobs.pay_scott_pence and the rest)
 * the same as its rates and price say (19 Nov 2026: Isabella's £715 survey,
 * repriced after booking, still showed the split of £450 on Money and rates
 * and to ChatGPT, while Pay worked it out right). Pay works it out live; the
 * lists that sum the stored figures call this first, and so does the hourly run.
 * Only a figure that differs is written, so a quiet run writes nothing.
 */
import { query } from './db.js';
import { calcJob } from './splits.js';

const DAMP = ['dampscan', 'ati-london'];

export async function syncPay() {
  const rows = await query(`select id, survey_price_pence, surveyor_fee_pence, remedial_pence, surveyor, tax_bp, lead_bp, lead_earner,
      partner_a, partner_b, shares, pay_scott_pence, pay_tom_pence, pay_ben_pence from jobs where site = any($1::text[])`, [DAMP]);
  let fixed = 0;
  for (const j of rows) {
    const c = calcJob({ surveyPence: j.survey_price_pence, surveyorFeePence: j.surveyor_fee_pence, remedialPence: j.remedial_pence, surveyor: j.surveyor,
      taxBp: j.tax_bp, leadBp: j.lead_bp, leadEarner: j.lead_earner, partners: [j.partner_a, j.partner_b], shares: j.shares });
    if (c.pay.scott === Number(j.pay_scott_pence) && c.pay.tom === Number(j.pay_tom_pence) && c.pay.ben === Number(j.pay_ben_pence)) continue;
    await query('update jobs set pay_scott_pence = $2, pay_tom_pence = $3, pay_ben_pence = $4 where id = $1', [j.id, c.pay.scott, c.pay.tom, c.pay.ben]);
    fixed += 1;
  }
  return { fixed };
}
