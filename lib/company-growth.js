/**
 * Company, Growth (the owners' plan, 15 Nov 2026): where the work comes from
 * and what it costs to win. Google Ads first, since it is the one channel paid
 * for: the spend logged on Money against the enquiries, bookings and money the
 * paid clicks brought (a session's channel, lib/attribution.js), so a cost per
 * booked survey and a return per pound. Then the funnel month by month
 * (visitors, enquiries, booked, paid, money) and every source over the company
 * year, and the booking form step by step (where people leave). Phone callers count under "Phone call", never as website bookings; a
 * form sent twice (closed as a duplicate, lib/merge-dupes.js) counts once.
 */
import { query } from './db.js';
import { feedStatus } from './ads-conversions.js';
import { siteErrors } from './site-errors.js';

/* The four-step booking form went live on every ATi and DampScan page. */
export const FORM_LIVE = '2026-11-16';
const DAMP = ['dampscan', 'ati-london'];
const london = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const monthStart = (day, back = 0) => { const d = new Date(day.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };

/* Each enquiry with where it came from and what it became: its first visit's channel, its job's state and price. */
const ENQUIRIES = `
  select to_char(l.created_at at time zone 'Europe/London', 'YYYY-MM') as m,
         case when l.source_path = 'phone' then 'Phone call' when l.source_path = 'email' then 'Email' when l.referred_by is not null then 'agent'
              when coalesce(l.utm->>'gclid', l.utm->>'gbraid', l.utm->>'wbraid', '') <> '' then 'paid' else coalesce(a.channel, 'unknown') end as source,
         (j.id is not null and j.status not in ('cancelled', 'declined')) as booked,
         (j.paid_at is not null and j.status not in ('cancelled', 'declined', 'refunded')) as paid, coalesce(j.survey_price_pence, 0) as price
    from leads l
    left join lateral (select channel from events e where e.session_id = l.session_id order by e.created_at limit 1) a on true
    left join lateral (select id, status, paid_at, survey_price_pence from jobs where lead_id = l.id order by id limit 1) j on true
   where l.stage = 'complete' and l.site = any($1::text[]) and l.created_at >= $2::date
     and coalesce(l.closed_reason, '') not like 'Duplicate%'`;

export const SOURCE_NAMES = { agent: 'Estate agent links', paid: 'Google Ads', organic: 'Google search', direct: 'Typed in or bookmarked', referral: 'Another website', social: 'Social media', email: 'Email link', unknown: 'Not known' };

export async function growth({ today = london(new Date()) } = {}) {
  /* Marketing reads over the trading year (1 December), not the company's money year: enquiries and ads ran before it. */
  const ys = `${Number(today.slice(5, 7)) === 12 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-12-01`, m5 = monthStart(today, 5);
  const from = ys < m5 ? ys : m5;
  const [rows, visits, ads, steps, adsFeed, problems] = await Promise.all([
    query(ENQUIRIES, [DAMP, from]),
    query(`select to_char(created_at at time zone 'Europe/London', 'YYYY-MM') as m, count(distinct session_id)::int as n,
        count(distinct session_id) filter (where channel = 'paid')::int as paid
        from events where type = 'page_view' and site = any($1::text[]) and created_at >= $2::date group by 1`, [DAMP, m5]).catch(() => []),
    query(`select to_char(spent_on, 'YYYY-MM') as m, sum(amount_pence)::bigint as pence from expenses
        where removed_at is null and category = 'Google Ads' and spent_on >= $1::date group by 1`, [from]),
    /* The booking form step by step, last 30 days of the four-step form (live 16 Nov 2026: its steps mean
       opened, details done, sent with the survey, time picked, so older events would muddle them), and the
       30 days before it as opened and sent, the one comparison both forms share. */
    query(`select case when type = 'form_submit' then 'sent' else detail->>'step' end as step, created_at >= $2::date as now, count(distinct session_id)::int as n
        from events where site = any($1::text[])
         and (created_at >= greatest(now() - interval '30 days', $2::date) or (created_at >= $2::date - 30 and created_at < $2::date))
         and (type = 'form_submit' or (type = 'form_step' and detail->>'step' ~ '^[1-9]$')) group by 1, 2`, [DAMP, FORM_LIVE]).catch(() => []),
    /* Paid customers sent back to Google Ads (lib/ads-conversions.js): the address and when Google last came for it. */
    Promise.all(DAMP.map((s) => feedStatus(s).catch(() => ({ site: s, url: null, paid: 0, lastFetched: null })))),
    /* What went wrong on the websites, last 30 days (lib/site-errors.js). */
    siteErrors().catch(() => null)
  ]);
  const sum = (list, f) => list.reduce((t, r) => t + f(r), 0);
  const tally = (list) => ({ enquiries: list.length, booked: list.filter((r) => r.booked).length, paid: list.filter((r) => r.paid).length, money: sum(list.filter((r) => r.paid), (r) => Number(r.price)) });

  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const m = monthStart(today, i).slice(0, 7), here = rows.filter((r) => r.m === m), v = visits.find((x) => x.m === m);
    months.push({ month: m, visitors: v ? v.n : 0, ...tally(here) });
  }

  /* Google Ads: the spend logged against what its paid clicks became, this month, last month and the year. */
  const adsFor = (fromM, toM) => {
    const inM = (m) => m >= fromM && m <= toM;
    const spend = sum(ads.filter((a) => inM(a.m)), (a) => Number(a.pence));
    const t = tally(rows.filter((r) => r.source === 'paid' && inM(r.m)));
    const per = (n) => (n ? Math.round(spend / n) : null);
    return { spend, ...t, perEnquiry: per(t.enquiries), perBooked: per(t.booked), perPaid: per(t.paid), back: spend ? Math.round((t.money / spend) * 100) / 100 : null };
  };
  const m0 = monthStart(today).slice(0, 7), m1 = monthStart(today, 1).slice(0, 7);
  const googleAds = { month: adsFor(m0, m0), last: adsFor(m1, m1), year: adsFor(ys.slice(0, 7), m0) };

  /* Every source over the company year, best money first. */
  const yearRows = rows.filter((r) => r.m >= ys.slice(0, 7));
  const keys = [...new Set(yearRows.map((r) => r.source))];
  const sources = keys.map((k) => ({ key: k, name: SOURCE_NAMES[k] || k, ...tally(yearRows.filter((r) => r.source === k)) }))
    .sort((a, b) => b.money - a.money || b.enquiries - a.enquiries);

  const nowSteps = steps.filter((r) => r.now), was = steps.filter((r) => !r.now);
  const formSteps = nowSteps.filter((r) => r.step !== 'sent').map((r) => ({ step: Number(r.step), n: r.n })).sort((a, b) => a.step - b.step);
  const count = (list, step) => (list.find((r) => r.step === step) || { n: 0 }).n;
  const form = { since: FORM_LIVE, steps: formSteps, sent: count(nowSteps, 'sent'), before: { opened: count(was, '1'), sent: count(was, 'sent') } };
  return { today, yearFrom: ys, months, googleAds, adsFeed, problems, sources, year: tally(yearRows), form };
}
