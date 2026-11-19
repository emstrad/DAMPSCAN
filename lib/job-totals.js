/**
 * The Jobs page's figures, and the damp brands' all-time records.
 *
 * Only ATi and DampScan surveys count: the split (lib/splits.js) is theirs,
 * and Verge and CoolRight jobs used to swell "Jobs" with work that pays
 * nobody here. Cancelled jobs never count. A survey whose day has not come
 * is "booked ahead" and kept out of what has been earned, so the headline is
 * work done, with what is still to be paid shown beside it.
 */
import { query, queryOne } from './db.js';
import { TODAY } from './today.js';
import { syncPay } from './pay-sync.js';

export const DAMP = ['dampscan', 'ati-london'];
const SURVEYOR = { scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };
const N = (v) => Number(v || 0);
/* Money moved by hand between people on a survey (lib/pay-moves.js), net per person. */
const MOVED = ['scott', 'tom', 'ben', 'ronnie'].map((k) => `coalesce((select sum(case when m.to_key = '${k}' then m.pence when m.from_key = '${k}' then -m.pence else 0 end)
    from job_pay_moves m where m.job_id = j.id and m.removed_at is null), 0) as mv_${k}`).join(', ');

export async function jobTotals(sites, since) {
  const s = sites.filter((x) => DAMP.includes(x));
  await syncPay().catch(() => {});
  const t = await queryOne(
    `select count(*) filter (where done)                                  as done,
            count(*) filter (where not done)                              as ahead,
            count(*) filter (where done and paid_at is not null)          as paid,
            count(*) filter (where done and paid_at is null)              as unpaid,
            coalesce(sum(survey_price_pence) filter (where done), 0)      as done_value,
            coalesce(sum(survey_price_pence) filter (where not done), 0)  as ahead_value,
            coalesce(sum(survey_price_pence) filter (where done and paid_at is null), 0) as unpaid_value,
            coalesce(sum(remedial_pence) filter (where done), 0)          as remedial,
            coalesce(sum(pay_scott_pence + mv_scott) filter (where done), 0) as scott,
            coalesce(sum(pay_tom_pence + mv_tom) filter (where done), 0)     as tom,
            coalesce(sum(pay_ben_pence + mv_ben) filter (where done), 0)     as ben,
            coalesce(sum(case when surveyor = 'ronnie' then surveyor_fee_pence else 0 end + mv_ronnie) filter (where done), 0) as ronnie
       from (select j.*, j.job_date <= ${TODAY} as done, ${MOVED}
               from jobs j where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined') and j.job_date >= ${since}) j`, [s]);
  return {
    jobs: N(t.done), done: N(t.done), bookedAhead: N(t.ahead), paid: N(t.paid), unpaid: N(t.unpaid),
    surveyValuePence: N(t.done_value), aheadValuePence: N(t.ahead_value), unpaidValuePence: N(t.unpaid_value),
    remedialValuePence: N(t.remedial),
    pay: { scott: N(t.scott), tom: N(t.tom), ben: N(t.ben), ...(N(t.ronnie) ? { ronnie: N(t.ronnie) } : {}) }
  };
}

/** All-time records, to celebrate. Money only for a manager (money = true). */
export async function records(sites, money) {
  const s = sites.filter((x) => DAMP.includes(x));
  if (!s.length) return null;
  const DONE = `site = any($1::text[]) and status not in ('cancelled', 'declined') and job_date <= ${TODAY}`;
  const [all, month, week, day, people, districts, brands, ratings, reports, nth, thisMonth] = await Promise.all([
    queryOne(`select count(*) n, coalesce(sum(survey_price_pence),0) v, coalesce(sum(remedial_pence),0) r, min(job_date)::text first,
                     count(distinct split_part(upper(customer_postcode), ' ', 1)) areas from jobs where ${DONE}`, [s]),
    queryOne(`select to_char(date_trunc('month', job_date), 'YYYY-MM') m, count(*) n, sum(survey_price_pence) v from jobs where ${DONE} group by 1 order by 2 desc, 3 desc limit 1`, [s]),
    queryOne(`select date_trunc('week', job_date)::date::text w, count(*) n from jobs where ${DONE} group by 1 order by 2 desc, 1 desc limit 1`, [s]),
    queryOne(`select job_date::text d, count(*) n from jobs where ${DONE} group by 1 order by 2 desc, 1 desc limit 1`, [s]),
    query(`select surveyor, count(*) n from jobs where ${DONE} and surveyor is not null group by 1 order by 2 desc`, [s]),
    query(`select split_part(upper(customer_postcode), ' ', 1) k, count(*) n from jobs where ${DONE} and coalesce(customer_postcode, '') <> '' group by 1 order by 2 desc limit 5`, [s]),
    query(`select site, count(*) n from jobs where ${DONE} group by 1`, [s]),
    queryOne(`select count(*) n, round(avg(r.stars)::numeric, 2) avg, count(*) filter (where r.stars = 5) five from job_ratings r join jobs j on j.id = r.job_id where j.site = any($1::text[])`, [s]),
    queryOne(`select min(h) fastest, round(avg(h)) average from (select extract(epoch from survey_sent_at - (((job_date + coalesce(job_time, '12:00')) at time zone 'Europe/London') + interval '1 hour')) / 3600 h
                from jobs where ${DONE} and survey_sent_at is not null) x where h >= 0`, [s]),
    query(`select n, d::text from (select row_number() over (order by job_date, id) n, job_date d from jobs where ${DONE}) x where n in (1, 10, 25, 50, 100, 250, 500, 1000, 2500)`, [s]),
    queryOne(`select count(*) n from jobs where ${DONE} and date_trunc('month', job_date) = date_trunc('month', ${TODAY}::timestamp)`, [s])
  ]);
  const total = N(all.n);
  const next = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000].find((m) => m > total) || null;
  return {
    surveys: total, firstSurvey: all.first, areas: N(all.areas),
    ...(money ? { valuePence: N(all.v), remedialPence: N(all.r), bestMonthValuePence: month ? N(month.v) : 0 } : {}),
    bestMonth: month ? { month: month.m, surveys: N(month.n) } : null,
    thisMonth: N(thisMonth.n),
    bestWeek: week ? { from: week.w, surveys: N(week.n) } : null,
    bestDay: day ? { date: day.d, surveys: N(day.n) } : null,
    surveyors: people.map((p) => ({ name: SURVEYOR[p.surveyor] || p.surveyor, surveys: N(p.n) })),
    topAreas: districts.map((d) => ({ area: d.k, surveys: N(d.n) })),
    brands: Object.fromEntries(brands.map((b) => [b.site, N(b.n)])),
    ratings: { count: N(ratings.n), average: ratings.avg == null ? null : Number(ratings.avg), fiveStar: N(ratings.five) },
    reports: { fastestHours: reports.fastest == null ? null : Math.round(Number(reports.fastest) * 10) / 10, averageHours: reports.average == null ? null : N(reports.average) },
    milestones: nth.map((m) => ({ survey: N(m.n), date: m.d })),
    nextMilestone: next ? { at: next, toGo: next - total } : null
  };
}
