/**
 * GET /api/admin/insights?area=|site=
 *
 * How the business is doing, for the area being looked at:
 *
 *   money     this month and last: work done, money in, costs; and what is
 *             owed, quoted and booked right now. Manage or admin only, as on
 *             the Due list.
 *   months    the last twelve: enquiries, jobs won, work done, money in
 *   funnel    the last ninety days: enquiries, jobs started from them, won,
 *             lost, the win rate and the average job
 *   channels  where the last year's enquiries came from, and how many won
 *   places    the postcode districts they came from, which is what says
 *             which area pages are earning and which towns to write next
 *   pagesToWrite the districts in `places` with no area page of their own
 *             yet on that brand's site, busiest first: the area pages to
 *             write next (compared with lib/generated, which the build writes
 *             from content/areas)
 *   issues    what people asked about
 *   ratings   the customers' stars from the "how did we do" page: the
 *             average, how many, and the low ones with what they said
 *   overBudget quoted-trade jobs whose costs and clocked labour have passed
 *             the set share of the price (lib/profit.js). Money, so manage only
 *   search    Google Search Console, per brand: appearances, clicks,
 *             position, and the searches and pages behind them, once a
 *             service account is set up (lib/search-console.js)
 *
 * A job's value is its invoice for the quoted trades and the survey plus any
 * remedial work for damp, which is how each business prices. Money in is the
 * payments ledger for the quoted trades, and for damp the full price on the
 * day it was marked paid, which is the only date the damp jobs keep.
 */
import { allTime } from '../../potential.js';
import { query } from '../../db.js';
import { json, requireMethod } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { channelFor } from '../../attribution.js';
import { TODAY } from '../../today.js';
import { searchFor, searchConsoleConfigured } from '../../search-console.js';
import { ownSearch } from '../../search-own.js';
import { OVER_BUDGET_BP, COSTS_SQL, LABOUR_SQL, HOURS_SQL } from '../../profit.js';
import { LOW_STARS } from '../../rating.js';
import { districtOf } from '../../job-pages.js';
import { recurringIncome } from '../../coolright-kit.js';
import { areaDistricts } from '../../generated/gallery-shells.js';

export const config = { runtime: 'nodejs' };

const N = (v) => Number(v) || 0;
const WON = `('booked','completed','paid')`;
const VALUE = `(case when b.payout_model = 'damp' then j.survey_price_pence + j.remedial_pence else coalesce(j.invoice_net_pence, 0) end)`;
const MONTH = (col) => `to_char(${col}, 'YYYY-MM')`;

/* Kept exported from here for the callers that already import it. */
export { districtOf };

async function money(sites) {
  if (!sites.length) return null;
  const [m] = await query(
    `with jobs_v as (select j.*, ${VALUE} as value, b.payout_model from jobs j join businesses b on b.slug = j.site where j.site = any($1::text[])),
          paid as (select p.job_id, sum(p.amount_pence) as received from job_payments p join jobs_v j on j.id = p.job_id group by p.job_id)
     select
       coalesce(sum(value) filter (where status in ('completed','paid') and ${MONTH('job_date')} = ${MONTH(TODAY)}), 0) as work_this,
       coalesce(sum(value) filter (where status in ('completed','paid') and ${MONTH('job_date')} = ${MONTH(`(${TODAY} - interval '1 month')`)}), 0) as work_last,
       coalesce(sum(value) filter (where status = 'quoted' and payout_model <> 'damp'), 0) as quoted,
       coalesce(sum(value) filter (where status = 'booked'), 0) as booked,
       coalesce(sum(case when payout_model = 'damp' then value else value - coalesce((select received from paid where paid.job_id = jobs_v.id), 0) end)
         filter (where status = 'completed' and (payout_model <> 'damp' or paid_at is null)), 0) as owed
       from jobs_v`, [sites]);
  const inOut = async (offset) => {
    const month = offset ? MONTH(`(${TODAY} - interval '1 month')`) : MONTH(TODAY);
    const [r] = await query(
      `select
         (select coalesce(sum(p.amount_pence), 0) from job_payments p join jobs j on j.id = p.job_id where j.site = any($1::text[]) and j.site not in ('dampscan', 'ati-london') and ${MONTH('p.paid_on')} = ${month}) +
         (select coalesce(sum(j.survey_price_pence + j.remedial_pence), 0) from jobs j join businesses b on b.slug = j.site
           where j.site = any($1::text[]) and b.payout_model = 'damp' and j.paid_at is not null and ${MONTH("(j.paid_at at time zone 'Europe/London')")} = ${month}) as received,
         (select coalesce(sum(c.amount_pence), 0) from job_costs c join jobs j on j.id = c.job_id where j.site = any($1::text[]) and ${MONTH("(c.added_at at time zone 'Europe/London')")} = ${month}) as costs`,
      [sites]);
    return { receivedPence: N(r.received), costsPence: N(r.costs) };
  };
  const [now, last] = await Promise.all([inOut(0), inOut(1)]);
  return {
    thisMonth: { workPence: N(m.work_this), ...now },
    lastMonth: { workPence: N(m.work_last), ...last },
    owedPence: Math.max(0, N(m.owed)),
    quotedPence: N(m.quoted),
    bookedPence: N(m.booked)
  };
}

async function months(sites, moneySites) {
  const rows = await query(
    `with m as (select to_char(d, 'YYYY-MM') as month from generate_series(date_trunc('month', ${TODAY}) - interval '11 months', date_trunc('month', ${TODAY}), interval '1 month') d)
     select m.month,
       (select count(*) from leads l where l.site = any($1::text[]) and l.stage = 'complete' and ${MONTH("(l.created_at at time zone 'Europe/London')")} = m.month) as enquiries,
       (select count(*) from jobs j where j.site = any($1::text[]) and j.status in ${WON} and ${MONTH("(j.created_at at time zone 'Europe/London')")} = m.month) as won,
       (select coalesce(sum(${VALUE}), 0) from jobs j join businesses b on b.slug = j.site
         where j.site = any($2::text[]) and j.status in ('completed','paid') and ${MONTH('j.job_date')} = m.month) as work,
       (select coalesce(sum(p.amount_pence), 0) from job_payments p join jobs j on j.id = p.job_id where j.site = any($2::text[]) and ${MONTH('p.paid_on')} = m.month) as received
     from m order by m.month`, [sites, moneySites]);
  return rows.map((r) => ({ month: r.month, enquiries: N(r.enquiries), won: N(r.won), workPence: N(r.work), receivedPence: N(r.received) }));
}

async function funnel(sites) {
  const [r] = await query(
    `select
       (select count(*) from leads l where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '90 days') as enquiries,
       count(*) as jobs,
       count(*) filter (where j.lead_id is not null) as from_enquiries,
       count(*) filter (where j.status in ${WON}) as won,
       count(*) filter (where j.status in ('declined','cancelled')) as lost,
       coalesce(avg(${VALUE}) filter (where j.status in ${WON}), 0) as avg_value,
       avg(extract(epoch from (j.created_at - l.created_at)) / 86400) filter (where l.id is not null) as days_to_job
     from jobs j join businesses b on b.slug = j.site left join leads l on l.id = j.lead_id
     where j.site = any($1::text[]) and j.created_at >= now() - interval '90 days'`, [sites]);
  const won = N(r.won);
  const lost = N(r.lost);
  return {
    enquiries: N(r.enquiries), jobs: N(r.jobs), fromEnquiries: N(r.from_enquiries), won, lost,
    winRate: won + lost ? Math.round((100 * won) / (won + lost)) : null,
    avgJobPence: Math.round(N(r.avg_value)),
    daysToJob: r.days_to_job == null ? null : Math.round(Number(r.days_to_job) * 10) / 10
  };
}

/* The database calls ATi "ati-london"; the page build calls it "ati". */
const BUILD_KEY = { 'ati-london': 'ati' };

/** Where the year's enquiries came from, by channel and by district, with what they won. */
async function sources(sites) {
  const rows = await query(
    `select l.site, l.utm, l.referrer, l.postcode, l.issues, exists (select 1 from jobs j where j.lead_id = l.id and j.status in ${WON}) as won
       from leads l where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '365 days'`, [sites]);
  const tally = (key, bucket, won) => { const t = bucket.get(key) || { enquiries: 0, won: 0 }; t.enquiries += 1; if (won) t.won += 1; bucket.set(key, t); };
  const channels = new Map();
  const places = new Map();
  const issues = new Map();
  const unwritten = new Map();
  for (const r of rows) {
    tally(channelFor({ utm: r.utm || {}, referrer: r.referrer }), channels, r.won);
    const district = districtOf(r.postcode);
    if (district) tally(district, places, r.won);
    if (district && !(areaDistricts[BUILD_KEY[r.site] || r.site] || []).includes(district)) tally(`${r.site} ${district}`, unwritten, r.won);
    for (const i of r.issues || []) issues.set(i, (issues.get(i) || 0) + 1);
  }
  const sorted = (m, name) => [...m.entries()].map(([k, v]) => ({ [name]: k, ...v })).sort((a, b) => b.enquiries - a.enquiries);
  return {
    channels: sorted(channels, 'channel'),
    places: sorted(places, 'district').slice(0, 15),
    pagesToWrite: sorted(unwritten, 'key').slice(0, 20).map(({ key, ...t }) => ({ site: key.split(' ')[0], district: key.split(' ')[1], ...t })),
    issues: [...issues.entries()].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count).slice(0, 10)
  };
}

/** The last year's ratings: average, count, and the low ones to read. */
async function ratings(sites) {
  const [r] = await query(
    `select count(*) as n, avg(r.stars) as avg, count(*) filter (where r.stars = 5) as five
       from job_ratings r join jobs j on j.id = r.job_id where j.site = any($1::text[]) and r.created_at >= now() - interval '365 days'`, [sites]);
  const low = await query(
    `select j.id, j.site, j.customer_name, r.stars, r.comment, r.created_at
       from job_ratings r join jobs j on j.id = r.job_id
      where j.site = any($1::text[]) and r.stars <= ${LOW_STARS} and r.created_at >= now() - interval '365 days'
      order by r.created_at desc limit 20`, [sites]);
  return {
    count: N(r.n), five: N(r.five), average: r.avg == null ? null : Math.round(Number(r.avg) * 10) / 10,
    low: low.map((x) => ({ id: Number(x.id), site: x.site, customerName: x.customer_name, stars: N(x.stars), comment: x.comment, at: x.created_at }))
  };
}

/** Jobs from the last year whose costs and labour passed the set share of the price. */
export async function overBudget(sites) {
  if (!sites.length) return [];
  const rows = await query(
    `select * from (
       select j.id, j.site, j.customer_name, j.job_date::text as job_date, j.status, j.invoice_net_pence as price,
              ${COSTS_SQL} as costs, ${LABOUR_SQL} as labour, ${HOURS_SQL} as hours
         from jobs j join businesses b on b.slug = j.site
        where j.site = any($1::text[]) and b.payout_model <> 'damp' and j.status in ('booked','completed','paid')
          and j.invoice_net_pence > 0 and j.job_date >= ${TODAY} - 365) x
      where (costs + labour) * 10000 > price * ${OVER_BUDGET_BP}
      order by (costs + labour)::numeric / price desc limit 30`, [sites]);
  return rows.map((r) => ({ id: Number(r.id), site: r.site, customerName: r.customer_name, jobDate: r.job_date, status: r.status,
    pricePence: N(r.price), costsPence: N(r.costs), labourPence: N(r.labour), labourHours: Math.round(Number(r.hours) * 10) / 10,
    profitPence: N(r.price) - N(r.costs) - N(r.labour), spentBp: Math.round(((N(r.costs) + N(r.labour)) * 10000) / N(r.price)) }));
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const sites = requestedSites(scope, new URL(req.url, 'http://localhost').searchParams);
  const moneySites = sites.filter((s) => scope.isAdmin || scope.levels[s] === 'manage');
  try {
    /* Service plans are recurring income: CoolRight's (and Verge's maintenance plans), for whoever manages them. */
    const planSites = moneySites.filter((x) => x === 'ac' || x === 'roofing');
    const [m, mo, f, s, search, own, rt, ob, rec, at] = await Promise.all([money(moneySites), months(sites, moneySites), funnel(sites), sources(sites),
      Promise.all(sites.map(searchFor)), ownSearch(sites), ratings(sites), overBudget(moneySites), recurringIncome(planSites), allTime(moneySites)]);
    json(res, 200, { ok: true, sites, money: m, months: mo, funnel: f, ...s, searchConnected: searchConsoleConfigured(), search: search.filter(Boolean), ownSearch: own,
      ratings: rt, overBudget: moneySites.length ? ob : null, overBudgetBp: OVER_BUDGET_BP, recurring: rec && rec.plans ? rec : null, allTime: at });
  } catch (err) {
    console.error('insights request failed:', err.message);
    json(res, 500, { ok: false, error: 'insights_failed' });
  }
}
