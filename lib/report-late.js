/**
 * A survey report not sent within 24 hours of the survey ending (REPORT_DEADLINE
 * in lib/surveys.js: start plus the rate card's minutes, or the end of an
 * untimed day), as one phone alert per job. The board's countdown turns red
 * at the same moment. Only the last two days are looked at, so the first run
 * does not ring for every old survey, and the stamp keeps it to one alert.
 * The customer is first name and postcode district only, as every alert is.
 */
import { query } from './db.js';
import { notify } from './notify.js';
import { customer, jobPage, staffBase, money } from './alert-words.js';
import { quickButtons } from './quick-action.js';
import { REPORT_DEADLINE } from './surveys.js';

const SURVEYOR = { scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };

export async function alertLateReports() {
  const rows = await query(
    `update jobs j set report_late_alerted_at = now()
      where j.site in ('dampscan', 'ati-london') and j.survey_sent_at is null and not j.awaiting_agent
        and j.report_late_alerted_at is null and j.status in ('booked', 'completed', 'paid')
        and ${REPORT_DEADLINE} between now() - interval '2 days' and now()
      returning j.id, j.site, j.customer_name, j.customer_postcode, j.surveyor`);
  for (const r of rows) {
    await notify({ business: r.site, kind: 'report_late', ref: r.id, tags: 'alarm_clock', priority: 4, path: jobPage(r.site, r.id),
      actions: quickButtons(r.id, ['report'], staffBase() + jobPage(r.site, r.id)),
      title: `Report overdue: ${customer(r.customer_name, r.customer_postcode)}`,
      message: `24 hours since the survey${SURVEYOR[r.surveyor] ? ` (${SURVEYOR[r.surveyor]})` : ''} and the report is not sent.` });
  }
  return { sent: rows.length };
}

/**
 * The morning after a survey, one alert per survey still not paid in full,
 * with "Paid in full" (and "Deposit paid" while that is not ticked either) as
 * buttons, so the money can be ticked off from the lock screen. Surveys from
 * the last three days only, so the first run does not ring for old ones.
 */
export async function alertUnpaidSurveys() {
  const rows = await query(
    `update jobs j set unpaid_alerted_at = now()
      where j.site in ('dampscan', 'ati-london') and j.status in ('booked', 'completed') and j.paid_at is null
        and not j.awaiting_agent and j.unpaid_alerted_at is null and j.job_date < (now() at time zone 'Europe/London')::date
        and j.job_date >= (now() at time zone 'Europe/London')::date - 3
      returning j.id, j.site, j.customer_name, j.customer_postcode, j.deposit_paid_at, j.survey_price_pence, j.remedial_pence`);
  for (const r of rows) {
    const price = Number(r.survey_price_pence) || 0;
    /* Remedial work won is owed with the survey, so it counts in what is still to come. */
    const owed = (r.deposit_paid_at ? price - Math.ceil(price / 2) : price) + (Number(r.remedial_pence) || 0);
    await notify({ business: r.site, kind: 'survey_unpaid', ref: r.id, tags: 'pound', priority: 3, path: jobPage(r.site, r.id),
      actions: quickButtons(r.id, r.deposit_paid_at ? ['paid'] : ['paid', 'deposit'], staffBase() + jobPage(r.site, r.id)),
      title: `Not paid in full: ${customer(r.customer_name, r.customer_postcode)}`,
      message: `Surveyed, ${owed ? money(owed) + ' ' : ''}still to come in. Tick it off here when it lands.` });
  }
  return { sent: rows.length };
}
