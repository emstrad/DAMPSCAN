/**
 * The safety net under the enquiry alerts: an ATi or DampScan enquiry still in
 * New enquiry on the Scheduling board two hours on, with no call, email or
 * text logged and no job made, buzzes once more (ntfy and the staff app).
 * Only in working hours (8am to 7pm London), so an evening enquiry is nudged
 * the next morning, and once only per enquiry. Run from the hourly check.
 */
import { query } from './db.js';
import { notify } from './notify.js';
import { brandName, customer } from './alert-words.js';

const DAMP = ['dampscan', 'ati-london'];

export async function nudgeUntouched(now = new Date()) {
  const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
  if (hour < 8 || hour >= 19) return { nudged: 0 };
  const rows = await query(`select id, site, first_name, postcode, created_at from leads
     where site = any($1::text[]) and stage = 'complete' and closed_at is null and sched_nudged_at is null
       and coalesce(sched_stage, 'new') = 'new' and jsonb_array_length(coalesce(sched_log, '[]'::jsonb)) = 0
       and created_at < $2::timestamptz - interval '2 hours' and created_at > $2::timestamptz - interval '3 days'
       and not exists (select 1 from jobs j where j.lead_id = leads.id)
     order by created_at limit 20`, [DAMP, now.toISOString()]);
  for (const l of rows) {
    const hours = Math.round((now - new Date(l.created_at)) / 3600000);
    await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'alarm_clock', priority: 4, path: `/schedule.html#lead-${l.id}`,
      title: `Still waiting: ${brandName(l.site)}`,
      message: `${customer(l.first_name, l.postcode, ' in ')} has waited ${hours} hours with no call or email logged.` });
    await query('update leads set sched_nudged_at = now() where id = $1', [l.id]);
  }
  return { nudged: rows.length };
}
