/**
 * GET /api/cron/evening
 *
 * The evening run, on the schedule in vercel.json (17:00 UTC, so 6pm in
 * summer and 5pm in winter, and the plan may start it any time in that hour).
 * Tells each business what is booked for tomorrow, while there is still time
 * to ring a customer or load the van, and catches any half-finished forms
 * from the day. Both are stamped, so a second run sends nothing. It also
 * fetches the week's forecast for Verge's booked roofs (lib/weather.js).
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { alertDiary, alertPartials } from '../../daily-alerts.js';
import { warmRoofing } from '../../weather.js';
import { alertLateReports } from '../../report-late.js';
import { runCompetitorWatch } from '../../competitors.js';
import { routeCheck } from '../../route-check.js';
import { textJob, smsLive } from '../../sms.js';
import { query } from '../../db.js';
import { londonToday } from '../../pipeline.js';

const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* Tomorrow's damp surveys get their reminder text, once, when texts are on. */
async function remindTomorrow(day) {
  if (!smsLive()) return 'off';
  const due = await query(`select j.id from jobs j where j.site in ('dampscan', 'ati-london') and j.job_date = $1::date and j.date_set and j.status = 'booked'
      and not exists (select 1 from job_messages m where m.job_id = j.id and m.kind = 'reminder' and m.sent_at > now() - interval '2 days')`, [day]);
  let sent = 0;
  for (const j of due) if ((await textJob(j.id, 'reminder')).sent) sent += 1;
  return { sent };
}

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  try {
    /* The owners turned the "Tomorrow" push off; EVENING_DIARY=on brings it back. */
    const tomorrow = process.env.EVENING_DIARY === 'on' ? await alertDiary(1) : 'off';
    const partials = await alertPartials().catch((err) => ({ error: err.message }));
    /* The roofing forecast, fetched now so tomorrow's week board is instant. */
    const weather = await warmRoofing().catch((err) => ({ error: err.message }));
    const reports = await alertLateReports().catch((err) => ({ error: err.message }));
    /* Monthly: it does nothing until 28 days have passed since the last look. */
    const competitors = await runCompetitorWatch().catch((err) => ({ error: err.message }));
    /* Each surveyor's day tomorrow, drive by drive, and the customers' reminders once texts are on. */
    const day = addDays(londonToday(), 1);
    const route = await routeCheck(day).catch((err) => ({ error: err.message }));
    const texts = await remindTomorrow(day).catch((err) => ({ error: err.message }));
    json(res, 200, { ok: true, tomorrow, partials, weather, reports, competitors, route, texts });
  } catch (err) {
    console.error('evening run failed:', err.message);
    json(res, 500, { ok: false, error: 'evening_failed' });
  }
}
