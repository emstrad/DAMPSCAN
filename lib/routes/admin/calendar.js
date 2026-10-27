/**
 * GET /api/admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&area=|site=
 *
 * Everything with a date on it between two days: booked and finished work for
 * every trade, and service visits falling due. One list, so the calendar can
 * show a damp survey and a re-roof on the same day without asking twice.
 *
 * Scoped like every other list, and money is left out: a calendar shows who
 * is where, and the value of a job belongs to whoever manages the business.
 * A window is at most about two months, which is a month view with the edges
 * of the weeks either side, and keeps one request bounded.
 *
 * ?view=work adds the working day on top: today's visits whatever month is
 * on screen, the "Action needed" list from lib/work.js (the same list the
 * assistant reads), and on each job the action groups it sits in, so a day
 * cell can badge "unpaid" or "report not sent" without a second request.
 * Money groups follow the same rule as Due: managers and admins only. Items
 * the person has snoozed (snooze.js) are left out until their day. It also
 * carries `unbooked`: agreed work with no date anybody chose (date_set false),
 * which Today lists apart instead of on the day the job was typed in.
 *
 * It also carries `pencils`: times offered and not yet confirmed (lib/pencils.js),
 * which Today and the week draw grey, never as booked.
 *
 * ?view=job&id= is one job as Today's pop-up shows it (lib/calendar-job.js).
 */
import { contactOf } from '../../contact-note.js';
import { query } from '../../db.js';
import { json, requireMethod } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { actionsFor, flagsByJob } from '../../work.js';
import { londonToday } from '../../pipeline.js';
import { snoozedFor, withoutSnoozed } from './snooze.js';
import { unbookedFor, jobFor } from '../../calendar-job.js';
import { timelineFor } from '../../timeline.js';
import { matchesFor } from '../../duplicates.js';
import { pencilsFor } from '../../pencils.js';

export const config = { runtime: 'nodejs' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 70;
const day = (v) => (v == null ? null : String(v).slice(0, 10));

/** Booked and finished work and services due between two days, for these sites. */
export async function eventsFor(sites, from, to) {
  const jobs = await query(
    `select j.id, j.site, j.job_date::text as job_date, j.job_time, j.customer_name, j.customer_postcode, j.status, j.awaiting_agent, j.date_set, b.payout_model,
            coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email, j.note,
            j.surveyor, r.label as survey_label,
            (select count(*) from todos t where t.job_id = j.id and t.done_at is null)::int as todo_count
       from jobs j join businesses b on b.slug = j.site left join leads l on l.id = j.lead_id
       left join job_rates r on r.key = j.survey_type
      where j.site = any($1::text[]) and j.job_date between $2::date and $3::date
        and j.status in ('booked', 'completed', 'paid')
      order by j.job_date, j.job_time nulls last, j.id limit 500`, [sites, from, to]);
  const services = await query(
    `select c.id, c.business_slug, c.job_id, coalesce(c.booked_on, c.next_due_on)::text as next_due_on, c.booked_on is not null as booked,
            c.booked_time, c.customer_name, c.customer_postcode
       from service_contracts c
      where c.business_slug = any($1::text[]) and c.status = 'active' and coalesce(c.booked_on, c.next_due_on) between $2::date and $3::date
      order by coalesce(c.booked_on, c.next_due_on), c.booked_time nulls last, c.id limit 200`, [sites, from, to]);
  return [
    ...jobs.map((r) => ({
      kind: 'job', id: Number(r.id), site: r.site, date: day(r.job_date), time: r.job_time ? String(r.job_time).slice(0, 5) : null,
      customerName: r.customer_name, postcode: r.customer_postcode, status: r.status, quoted: r.payout_model !== 'damp', awaitingAgent: Boolean(r.awaiting_agent), dateSet: Boolean(r.date_set), surveyLabel: r.survey_label || null, surveyor: r.surveyor || null, todoCount: r.todo_count || 0,
      ...contactOf(r.phone, r.email, r.note)
    })),
    ...services.map((r) => ({
      kind: 'service', id: Number(r.id), jobId: r.job_id == null ? null : Number(r.job_id), site: r.business_slug, date: day(r.next_due_on),
      /* A visit agreed with the customer (CoolRight's service round) sits on its day and time. */
      time: r.booked_time ? String(r.booked_time).slice(0, 5) : null, customerName: r.customer_name, postcode: r.customer_postcode,
      status: r.booked ? 'service booked' : 'service due', quoted: true
    }))
  ];
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('view') === 'matches') {
    return json(res, 200, { ok: true, matches: await matchesFor(scope, Number(url.searchParams.get('id')) || 0) });
  }
  if (url.searchParams.get('view') === 'timeline') {
    const events = await timelineFor(scope, Number(url.searchParams.get('id')) || 0);
    return events ? json(res, 200, { ok: true, events }) : json(res, 404, { ok: false, error: 'not_found' });
  }
  if (url.searchParams.get('view') === 'job') {
    const job = await jobFor(scope, scope.businesses, Number(url.searchParams.get('id')) || 0).catch((err) => {
      console.error('calendar job failed:', err.message);
      return undefined;
    });
    if (job === undefined) return json(res, 500, { ok: false, error: 'calendar_failed' });
    return job ? json(res, 200, { ok: true, job }) : json(res, 404, { ok: false, error: 'not_found' });
  }
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const span = ISO.test(from || '') && ISO.test(to || '') ? (Date.parse(to) - Date.parse(from)) / 86400000 : -1;
  if (span < 0 || span > MAX_DAYS) {
    json(res, 400, { ok: false, error: 'bad_range', message: `Ask for a from and to date, at most ${MAX_DAYS} days apart.` });
    return;
  }
  const sites = requestedSites(scope, url.searchParams);
  try {
    const events = await eventsFor(sites, from, to);
    if (url.searchParams.get('view') !== 'work') {
      json(res, 200, { ok: true, from, to, events });
      return;
    }
    const today = londonToday();
    /* Snoozed items leave this person's list until their day comes. */
    const [all, todays, hidden, unbooked, pencils] = await Promise.all([actionsFor(scope, sites, { today }), eventsFor(sites, today, today), snoozedFor(scope, today), unbookedFor(sites), pencilsFor(sites, from, to)]);
    const work = withoutSnoozed(all, hidden);
    const flags = flagsByJob(work);
    const tag = (e) => (e.kind === 'job' ? { ...e, flags: flags.get(e.id) || [] } : e);
    json(res, 200, { ok: true, from, to, today, events: events.map(tag), todayEvents: todays.map(tag), unbooked: unbooked.map(tag), pencils, work });
  } catch (err) {
    console.error('calendar request failed:', err.message);
    json(res, 500, { ok: false, error: 'calendar_failed' });
  }
}
