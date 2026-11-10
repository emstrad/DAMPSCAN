/**
 * The alerts that come from the clock rather than from a change: a form left
 * half finished, an invoice gone past its due date, and tomorrow's diary.
 *
 * The hosting plan only runs scheduled jobs once a day each, so these ride on
 * the morning digest run and the evening run (api/cron/[task].js). Every one
 * is stamped or looked up before it goes, so a rerun, or two runs racing,
 * sends nothing twice. Words follow lib/alert-words.js: first name and
 * postcode district, whole pounds, never more of the customer.
 */
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { brandName, customer, clock, money, page, jobPage } from './alert-words.js';
import { TODAY } from './today.js';
import { cardPartials } from './partial-cards.js';

const N = (v) => Number(v) || 0;
/* Whole pounds: an alert is a nudge, not a statement. */
export const pounds = (pence) => money(Math.round(N(pence) / 100) * 100);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* Only partials from the last few days: the first run after this shipped
   should not dig up every abandoned form there has ever been. */
const PARTIAL_MAX_AGE = '3 days';

/**
 * Half-finished forms: a step 1 left over an hour ago with no finished
 * enquiry from the same visit or email since. Claimed by the update itself,
 * so two runs at once cannot both send one. `site` limits it to one business
 * (the piggyback from a new partial in api/lead.js); null is every business.
 */
export async function alertPartials(site = null) {
  /* ATi and DampScan ones become Scheduling cards first, each with its own alert. */
  await cardPartials(site).catch((err) => console.warn('partial cards failed:', err.message));
  const claimed = await query(
    `update leads l set partial_alerted_at = now()
       from businesses b
      where b.slug = l.site and b.active and l.stage = 'partial' and l.closed_at is null and l.partial_alerted_at is null
        and l.created_at < now() - interval '1 hour' and l.created_at > now() - interval '${PARTIAL_MAX_AGE}'
        and ($1::text is null or l.site = $1)
        and not exists (select 1 from leads c where c.stage = 'complete' and c.site = l.site
                          and (c.session_id = l.session_id or lower(c.email) = lower(l.email)))
      returning l.id, l.site, l.first_name, l.postcode`, [site]);
  for (const l of claimed) {
    await notify({
      business: l.site, kind: 'lead_partial', ref: l.id, tags: 'hourglass', priority: 3, path: page('dashboard.html', l.site),
      title: `Half-finished: ${brandName(l.site)}`,
      message: `${cap(customer(l.first_name, l.postcode, ' in '))} started a quote but didn't finish. Tap to follow up.`
    });
  }
  return claimed.length;
}

/* Due again when never told, when the invoice was reissued with a later due
   date since, or a week on (less a little, as the cron's minute wanders). */
const OVERDUE_DUE = `(j.overdue_alerted_at is null
   or (j.overdue_alerted_at at time zone 'Europe/London')::date <= j.invoice_due_on
   or j.overdue_alerted_at < now() - interval '6 days 12 hours')`;

/** Issued invoices at least a day past due with money still owing. */
export async function alertOverdue() {
  const rows = await query(
    `select j.id, j.site, j.customer_name, j.customer_postcode, j.invoice_net_pence - coalesce(r.received, 0) as owed,
            (${TODAY} - j.invoice_due_on) as days
       from jobs j
       join businesses b on b.slug = j.site and b.active
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.invoice_number is not null and j.invoice_due_on < ${TODAY}
        and j.status not in ('cancelled', 'declined', 'refunded', 'paid')
        and j.invoice_net_pence > coalesce(r.received, 0) and ${OVERDUE_DUE}
      order by j.id`);
  let sent = 0;
  for (const j of rows) {
    const won = await queryOne(`update jobs j set overdue_alerted_at = now() where j.id = $1 and ${OVERDUE_DUE} returning j.id`, [j.id]);
    if (!won) continue;
    const days = N(j.days);
    await notify({
      business: j.site, kind: 'invoice_overdue', ref: j.id, tags: 'hourglass_flowing_sand', priority: 3, path: jobPage(j.site, j.id),
      title: `Overdue: ${brandName(j.site)}`,
      message: `${customer(j.customer_name, j.customer_postcode)} is ${days} ${days === 1 ? 'day' : 'days'} past due on ${pounds(j.owed)}. Tap to send a reminder.`
    });
    sent++;
  }
  return sent;
}

/** "9:30am Sarah, BR6. 2pm Dev, DA1." from booked jobs, timed ones first. */
export function diaryLine(jobs) {
  return jobs.map((j) => {
    const t = clock(j.job_time);
    return `${t ? `${t} ` : 'No time set: '}${customer(j.customer_name, j.customer_postcode)}.`;
  }).join(' ');
}

/**
 * One alert per business listing its booked jobs and surveys for a day.
 * `offset` 1 is tomorrow (the evening run). The day goes in ref, as a number
 * like 20261015, so a business is told about a day once however often this runs.
 */
export async function alertDiary(offset = 1) {
  const label = offset === 0 ? 'Today' : 'Tomorrow';
  const jobs = await query(
    `select j.id, j.site, j.customer_name, j.customer_postcode, to_char(j.job_time, 'HH24:MI') as job_time,
            to_char(${TODAY} + $1::int, 'YYYYMMDD')::bigint as ref
       from jobs j join businesses b on b.slug = j.site and b.active
      where j.status = 'booked' and j.job_date = ${TODAY} + $1::int
      order by j.site, j.job_time nulls last, j.id`, [offset]);
  const bySite = new Map();
  for (const j of jobs) bySite.set(j.site, [...(bySite.get(j.site) || []), j]);
  let sent = 0;
  for (const [site, list] of bySite) {
    const ref = list[0].ref;
    if (await queryOne(`select 1 from notifications where business_slug = $1 and kind = 'diary' and ref = $2`, [site, ref])) continue;
    await notify({
      business: site, kind: 'diary', ref, tags: 'spiral_calendar', priority: 3, path: page('calendar.html', site),
      title: `${label}: ${brandName(site)}`, message: diaryLine(list)
    });
    sent++;
  }
  return sent;
}
