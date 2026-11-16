/**
 * The Monday summary: one alert per business on how the last seven days went.
 * ATi and DampScan instead get one Monday briefing between them (Company,
 * Week, lib/company-week.js), so the owners have one screen, not two lines.
 *
 * Sent from the morning run when it is Monday in London. Counts and whole
 * pounds only, never a customer. Looked up in notifications before it goes,
 * so a second run on the same Monday says nothing.
 */
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { page } from './alert-words.js';
import { pounds } from './daily-alerts.js';
import { TODAY } from './today.js';
import { digestCounts } from './todos.js';
import { week, weekPush } from './company-week.js';

const N = (v) => Number(v) || 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** True when `now` falls on a Monday in London, whatever the server's clock zone. */
export const isLondonMonday = (now = new Date()) => now.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' }) === 'Mon';

/** The figures for one business over the last seven days. */
export async function weekFigures(business) {
  const site = business.slug;
  const leads = await queryOne(
    `select count(*) filter (where l.stage = 'complete') as enquiries,
            count(*) filter (where l.stage = 'partial' and l.closed_at is null and not exists (
              select 1 from leads c where c.stage = 'complete' and c.site = l.site and (c.session_id = l.session_id or lower(c.email) = lower(l.email)))) as partials
       from leads l where l.site = $1 and l.created_at >= now() - interval '7 days'`, [site]);
  /* Won: accepted online, or saved straight in as booked or further on. */
  const won = await queryOne(
    `select count(*) as n from jobs where site = $1 and status in ('booked', 'completed', 'paid')
        and coalesce(quote_accepted_at, created_at) >= now() - interval '7 days'`, [site]);
  /* The damp brands tick paid in full on a survey price; the quoted trades keep a payments list. */
  const money = business.payout_model === 'damp'
    ? await queryOne(`select coalesce(sum(survey_price_pence), 0) as p from jobs where site = $1 and paid_at >= now() - interval '7 days'`, [site])
    : await queryOne(`select coalesce(sum(p.amount_pence), 0) as p from job_payments p join jobs j on j.id = p.job_id
                       where j.site = $1 and p.paid_on > ${TODAY} - 7`, [site]);
  const rated = await queryOne(
    `select count(*) as n, avg(r.stars) as avg from job_ratings r join jobs j on j.id = r.job_id
      where j.site = $1 and r.created_at >= now() - interval '7 days'`, [site]);
  const overdue = await queryOne(
    `select count(*) as n from jobs j
       left join (select job_id, sum(amount_pence) as received from job_payments group by job_id) r on r.job_id = j.id
      where j.site = $1 and j.invoice_number is not null and j.invoice_due_on < ${TODAY}
        and j.status not in ('cancelled', 'declined', 'refunded', 'paid') and j.invoice_net_pence > coalesce(r.received, 0)`, [site]);
  const todos = (await digestCounts(site)).reduce((n, r) => n + N(r.open), 0);
  return {
    enquiries: N(leads.enquiries), partials: N(leads.partials), won: N(won.n), moneyInPence: N(money.p),
    ratings: N(rated.n), ratingAvg: rated.avg == null ? null : Math.round(Number(rated.avg) * 10) / 10,
    overdue: N(overdue.n), todos
  };
}

/** The sentence for a week, or null when nothing at all happened or waits. */
export function weekLine(f) {
  if (!f.enquiries && !f.partials && !f.won && !f.moneyInPence && !f.ratings && !f.overdue && !f.todos) return null;
  const parts = [
    `${plural(f.enquiries, 'enquiry', 'enquiries')}, ${plural(f.partials, 'half-finished form', 'half-finished forms')}.`,
    `${plural(f.won, 'job won', 'jobs won')}, ${pounds(f.moneyInPence)} in.`,
    f.ratings ? `${plural(f.ratings, 'new rating', 'new ratings')}, averaging ${f.ratingAvg} stars.` : 'No new ratings.'
  ];
  if (f.overdue) parts.push(`${plural(f.overdue, 'invoice', 'invoices')} overdue.`);
  if (f.todos) parts.push(`${plural(f.todos, 'open to-do', 'open to-dos')}.`);
  return parts.join(' ');
}

/** Sends the summary for every active business, once per Monday. */
export async function runWeekly(now = new Date()) {
  if (!isLondonMonday(now)) return 0;
  const businesses = await query('select slug, name, payout_model from businesses where active order by slug');
  const ref = Number((await queryOne(`select to_char(${TODAY}, 'YYYYMMDD') as d`)).d);
  let sent = 0;
  if (businesses.some((b) => b.slug === 'dampscan' || b.slug === 'ati-london')
    && !(await queryOne(`select 1 from notifications where business_slug = 'dampscan' and kind = 'briefing' and ref = $1`, [ref]))) {
    const w = await week();
    /* A week with nothing done, booked or waiting says nothing. */
    if (w.last.enquiries || w.last.booked || w.last.in || w.ahead.total || w.toBook.n || w.reportsLate || w.attention.length) {
      await notify({ business: 'dampscan', kind: 'briefing', ref, tags: 'bar_chart', priority: 3, path: '/company.html#week', title: 'Monday briefing', message: weekPush(w) });
      sent++;
    }
  }
  for (const b of businesses) {
    if (b.slug === 'dampscan' || b.slug === 'ati-london') continue;
    if (await queryOne(`select 1 from notifications where business_slug = $1 and kind = 'weekly' and ref = $2`, [b.slug, ref])) continue;
    const line = weekLine(await weekFigures(b));
    if (!line) continue;
    await notify({ business: b.slug, kind: 'weekly', ref, tags: 'bar_chart', priority: 3, path: page('insights.html', b.slug), title: `Last week: ${b.name}`, message: line });
    sent++;
  }
  return sent;
}
