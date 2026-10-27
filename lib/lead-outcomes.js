/**
 * What the website's enquiries turned into, by the page people landed on and
 * by where they came from: enquiries, surveys booked, paid, and (managers
 * only) the money paid. Joins the marketing view (Leads) to the work, so a
 * page that brings enquiries nobody books, or few that all pay, shows up.
 * Phone callers added on Scheduling are counted under "Phone call".
 */
import { query } from './db.js';
import { sinceExpr } from './metrics.js';

const SQL = (key, since) => `
  select ${key} as key, count(*) as enquiries,
         count(j.id) filter (where j.status not in ('cancelled', 'declined')) as booked,
         count(j.id) filter (where j.paid_at is not null) as paid,
         coalesce(sum(coalesce(j.survey_price_pence, 0)) filter (where j.paid_at is not null), 0) as paid_pence
    from leads l
    left join lateral (select channel, landing_page from events e where e.session_id = l.session_id order by e.created_at limit 1) a on true
    left join lateral (select id, status, paid_at, survey_price_pence from jobs where lead_id = l.id order by id limit 1) j on true
   where l.stage = 'complete' and l.created_at >= ${since} and l.site = any($1::text[])
   group by 1 order by enquiries desc, key limit 30`;

const shape = (money) => (r) => ({
  key: r.key, enquiries: Number(r.enquiries), booked: Number(r.booked), paid: Number(r.paid),
  bookedRate: Number(r.enquiries) ? Math.round((Number(r.booked) / Number(r.enquiries)) * 100) : 0,
  ...(money ? { paidPence: Number(r.paid_pence) } : {})
});

export async function outcomes(range, sites, money) {
  const since = sinceExpr(range);
  const [pages, sources] = await Promise.all([
    query(SQL(`case when l.source_path = 'phone' then 'Phone call' else coalesce(a.landing_page, l.source_path, '(unknown)') end`, since), [sites]),
    query(SQL(`case when l.source_path = 'phone' then 'Phone call' else coalesce(a.channel, 'unknown') end`, since), [sites])
  ]);
  return { byPage: pages.map(shape(money)), bySource: sources.map(shape(money)) };
}
