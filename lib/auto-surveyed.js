/**
 * A booked damp survey becomes Surveyed by itself once its visit is over (the
 * start plus the rate card's minutes and any extras, SURVEY_END) or its report
 * is uploaded, so nobody has to tick it (UAT, 15 Nov 2026: a survey stayed
 * Booked all evening with its report in). Never one waiting on the estate
 * agent, cancelled, or without a confirmed day. Run on staff requests, the
 * every-minute texts call, the hourly run and a report upload; cheap when there
 * are none. Logged in the customer's history like any other step.
 */
import { query } from './db.js';
import { SURVEY_END, DAMP_SITES } from './surveys.js';
import { record } from './audit.js';

export async function markSurveyed() {
  const done = await query(`update jobs j set status = 'completed', updated_at = now()
     where j.site = any($1::text[]) and j.status = 'booked' and j.date_set and not coalesce(j.awaiting_agent, false)
       and j.job_date is not null and (j.report_path is not null or ${SURVEY_END} < now())
     returning j.id, j.site, (j.report_path is not null) as reported`, [DAMP_SITES]);
  for (const j of done) {
    await record({ business: j.site, entity: 'job', entityId: j.id, action: 'auto_surveyed', before: { status: 'booked' },
      after: { status: 'completed', said: j.reported ? 'Marked surveyed: the report was uploaded.' : 'Marked surveyed: the visit time has passed.' } });
  }
  return done.length;
}
