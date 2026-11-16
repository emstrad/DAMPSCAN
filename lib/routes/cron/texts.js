/**
 * GET /api/cron/texts
 *
 * Sends every customer text whose two minutes are up (lib/texts.js flushDue).
 * A staff change holds its text two minutes so Undo can stop it, and nothing
 * sends it after that unless someone is still on a staff page, another request
 * comes in, or the hourly run goes: UAT (15 Nov 2026) found a booked text
 * sitting there. This is cheap, so an outside scheduler (cron-job.org) calls it
 * every minute with CRON_SECRET; quiet hours still hold texts till 9. From
 * 8:15 it also sends the morning text for a survey starting 9:00 to 9:59.
 */
import { json, requireMethod } from '../../http.js';
import { requireCron } from '../../cron-guard.js';
import { flushDue, morningTexts, isEarly } from '../../texts.js';
import { beat } from '../../heartbeat.js';
import { markSurveyed } from '../../auto-surveyed.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireCron(req, res)) return;
  if (isEarly()) await morningTexts(undefined, { early: true }).catch((err) => console.error('early morning texts failed:', err.message));
  const sent = await flushDue({ limit: 20 }).catch((err) => { console.error('text flush failed:', err.message); return -1; });
  await markSurveyed().catch((err) => console.error('auto surveyed failed:', err.message));
  await beat('texts').catch(() => {});
  return json(res, sent < 0 ? 500 : 200, { ok: sent >= 0, sent });
}
