/**
 * Two owner tools for the assistant.
 *
 * owner_briefing: the Monday look at last week per business, beyond
 * week_review's totals: how many enquiries became bookings, why the rest
 * did not (the reasons given when they were closed), how long reports took
 * from the end of the survey, each surveyor's surveys, and what is owed.
 * Managers only, as it is mostly money.
 *
 * match_email: the inbox sweep. The assistant reads the person's own Outlook
 * through their connector, and for each email passes the sender and the
 * words here; this finds the customer's jobs and enquiries by email, phone
 * and postcode, and says where each stands, so the assistant can propose
 * the next step for a yes. Nothing is changed by either tool.
 */
import { query } from '../db.js';
import { londonToday } from '../pipeline.js';
import { money } from '../alert-words.js';
import { read, fail, canManage } from './shared.js';
import { addDays } from './team-tools.js';
import { feedKey, conversionsFor, CONVERSION_NAME } from '../ads-conversions.js';
import { COMPETITORS, slugWords } from '../competitors.js';
import { searchFor } from '../search-console.js';
import { staffBase } from '../alert-words.js';
import { workOnly, REFUSED } from '../work-only.js';

const BRAND = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };
const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const SURVEYOR = { scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };

async function briefing(scope, { weeks_ago: ago = 1 }) {
  const sites = scope.businesses.filter((s) => canManage(scope, s));
  if (!sites.length) return fail('The owner briefing is for whoever manages a business.');
  const today = londonToday();
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const from = addDays(today, -dow - 7 * Math.max(0, Number(ago) || 0));
  const to = addDays(from, 7);
  const p = [sites, from, to];
  const [enq, booked, reasons, reports, surveyors, money_in, owed] = await Promise.all([
    query(`select site, count(*)::int n from leads where stage = 'complete' and site = any($1::text[]) and created_at >= $2 and created_at < $3 group by site`, p),
    query(`select l.site, count(distinct l.id)::int n from leads l join jobs j on j.lead_id = l.id
            where l.stage = 'complete' and l.site = any($1::text[]) and l.created_at >= $2 and l.created_at < $3 and j.status <> 'cancelled' group by l.site`, p),
    query(`select coalesce(nullif(closed_reason, ''), 'no reason given') reason, count(*)::int n from leads
            where site = any($1::text[]) and closed_at >= $2 and closed_at < $3 group by 1 order by 2 desc`, p),
    query(`select site, count(*)::int n, round(avg(extract(epoch from survey_sent_at - (((job_date + coalesce(job_time, '12:00')) at time zone 'Europe/London') + interval '1 hour')) / 3600))::int hours,
                  count(*) filter (where survey_sent_at > (((job_date + coalesce(job_time, '12:00')) at time zone 'Europe/London') + interval '25 hours'))::int late
             from jobs where site = any($1::text[]) and survey_sent_at >= $2 and survey_sent_at < $3 group by site`, p),
    query(`select surveyor, count(*)::int n from jobs where site = any($1::text[]) and job_date >= $2::date and job_date < $3::date
            and status in ('booked', 'completed', 'paid') and surveyor is not null group by surveyor order by 2 desc`, p),
    query(`select j.site, sum(x.pence)::bigint n from (
             select p.job_id, p.amount_pence pence from job_payments p where p.paid_on >= $2::date and p.paid_on < $3::date
             union all select id, survey_price_pence from jobs where paid_at >= $2 and paid_at < $3) x
           join jobs j on j.id = x.job_id where j.site = any($1::text[]) group by j.site`, p),
    query(`select site, count(*)::int n from jobs where site = any($1::text[]) and status = 'completed' and paid_at is null
            and site in ('dampscan', 'ati-london') group by site`, [sites])
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.site, r]));
  const [e, b, r, m, o] = [by(enq), by(booked), by(reports), by(money_in), by(owed)];
  const businesses = sites.map((s) => {
    const n = e[s] ? e[s].n : 0;
    const won = b[s] ? b[s].n : 0;
    return { business: BRAND[s] || s, enquiries: n, booked: won, conversion: n ? `${Math.round((won / n) * 100)}%` : null,
      moneyIn: money(Number(m[s] ? m[s].n : 0)),
      ...(r[s] ? { reportsSent: r[s].n, averageReportHours: r[s].hours, reportsLate: r[s].late } : {}),
      ...(o[s] ? { surveysUnpaid: o[s].n } : {}) };
  });
  return ok({ week: { from, to: addDays(from, 6) }, businesses,
    lostEnquiries: reasons, surveysBySurveyor: surveyors.map((x) => ({ surveyor: SURVEYOR[x.surveyor] || x.surveyor, surveys: x.n })),
    notHere: 'Ad spend is not in the staff area; if the person has a Google Ads connector, read the same week from it and compare cost per booking.',
    tip: 'Lead with what changed and what needs a decision, per business, in a few lines. Then lost enquiries and report times.' });
}

const PHONE = /(?:\+44\s?7\d{3}|07\d{3})\s?\d{3}\s?\d{3}|(?:\+44\s?|0)[1-3]\d{2,3}\s?\d{3}\s?\d{3,4}/g;
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

async function matchEmail(scope, { from_email: email, from_name: name, text }) {
  /* The inbox sweep hands back contacts on any job: a managers' tool. */
  if (workOnly(scope)) return fail(REFUSED);
  const words = String(text || '').slice(0, 5000);
  const phones = [...new Set((words.match(PHONE) || []).map((x) => x.replace(/\D/g, '').replace(/^44/, '0')))].slice(0, 3);
  const postcodes = [...new Set((words.match(POSTCODE) || []).map((x) => x.toUpperCase().replace(/\s+/g, '')))].slice(0, 3);
  const mail = String(email || '').trim().toLowerCase() || null;
  if (!mail && !phones.length && !postcodes.length && !name) return fail('Pass the sender\'s email, and the email\'s words.');
  const jobs = await query(
    `select j.id, j.site, j.status, j.job_date::text job_date, j.job_time::text job_time, j.awaiting_agent, j.deposit_paid_at, j.paid_at, j.survey_sent_at,
            coalesce(j.customer_name, l.first_name) customer, coalesce(j.customer_postcode, l.postcode) postcode, a.name agent
       from jobs j left join leads l on l.id = j.lead_id left join estate_agents a on a.id = j.estate_agent_id
      where j.site = any($1::text[]) and (
            lower(coalesce(j.customer_email, l.email, '')) = $2
         or regexp_replace(coalesce(j.customer_phone, l.phone, ''), '\\D', '', 'g') = any($3::text[])
         or replace(upper(coalesce(j.customer_postcode, l.postcode, '')), ' ', '') = any($4::text[])
         or lower(a.email) = $2)
      order by j.created_at desc limit 8`, [scope.businesses, mail || '-', phones, postcodes]);
  const leads = await query(
    `select l.id, l.site, l.first_name, l.postcode, l.created_at, l.closed_at, exists (select 1 from jobs j where j.lead_id = l.id) converted
       from leads l where l.site = any($1::text[]) and l.stage = 'complete' and (lower(l.email) = $2
         or regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g') = any($3::text[]) or replace(upper(l.postcode), ' ', '') = any($4::text[]))
      order by l.created_at desc limit 5`, [scope.businesses, mail || '-', phones, postcodes]);
  const stage = (j) => j.survey_sent_at ? 'report sent' : j.awaiting_agent ? 'waiting on the estate agent to confirm' : j.status === 'quoted' ? 'quoted, no answer yet'
    : !j.deposit_paid_at && j.status === 'booked' ? 'booked, deposit not paid' : j.status === 'completed' && !j.paid_at ? 'surveyed, not paid in full' : j.status;
  return ok({
    jobs: jobs.map((j) => ({ number: Number(j.id), customer: j.customer, postcode: j.postcode, business: BRAND[j.site], date: j.job_date, time: j.job_time && j.job_time.slice(0, 5), stands: stage(j), agent: j.agent || null })),
    enquiries: leads.map((l) => ({ id: Number(l.id), name: l.first_name, postcode: l.postcode, business: BRAND[l.site], received: l.created_at, status: l.converted ? 'converted' : l.closed_at ? 'closed' : 'open' })),
    tip: jobs.length || leads.length
      ? 'Say what the email is about and propose one next step from what it asks and where the job stands (book or move it, mark a payment, draft a reply). Wait for a yes.'
      : 'No customer matches. If it reads as a new enquiry, offer to add it with create_client or create_job.'
  });
}

async function adsSetup(scope, { site }) {
  if (!site || !canManage(scope, site)) return fail('Pick a business you manage.');
  if (!feedKey(site)) return fail('The conversions address needs SESSION_SECRET set (16 or more characters).');
  const rows = await conversionsFor(site);
  const url = `${staffBase().replace(/\/staff$/, '')}/api/admin/conversions?site=${site}&key=${feedKey(site)}`;
  return ok({ url, conversionName: CONVERSION_NAME, paidJobsFromAdsLast90Days: rows.length,
    steps: [
      `In Google Ads: Goals, Conversions, New conversion action, Import, Other data sources or CRMs, Track conversions from clicks. Name it exactly "${CONVERSION_NAME}", category Purchase, value: use different values.`,
      'Then Goals, Uploads, Schedules, New schedule, source HTTPS, paste the address below, daily.',
      'Keep this address private: anyone with it can read when ad clicks became paid jobs (no customer details).'
    ] });
}

async function competitorWatch(scope) {
  const sites = scope.businesses.filter((s) => s === 'dampscan' || s === 'ati-london');
  if (!sites.length) return fail('The competitor watch is for the damp brands.');
  const out = [];
  for (const c of COMPETITORS) {
    const checks = await query('select checked_at, pages, new_pages, error from competitor_checks where host = $1 order by checked_at desc limit 3', [c.host]);
    const recent = await query(`select url, title, first_seen from competitor_pages where host = $1 and first_seen > (select min(checked_at) from competitor_checks where host = $1) + interval '1 hour'
      order by first_seen desc limit 30`, [c.host]);
    out.push({ name: c.name, host: c.host, checks, newPages: recent.map((r) => ({ page: r.title || slugWords(r.url), url: r.url, seen: r.first_seen })) });
  }
  const ours = [];
  for (const s of sites) {
    const sc = await searchFor(s).catch(() => null);
    if (sc && !sc.error) ours.push({ business: BRAND[s], from: sc.from, to: sc.to, clicks: sc.now, before: sc.before, topSearches: sc.queries.slice(0, 15) });
  }
  return ok({ competitors: out, ourGoogle: ours,
    tip: 'Say what the competitors added (towns and services), whether we have a page for each, and which of our searches sit at position 8 to 20 that a better page could lift.' });
}

export const OWNER_TOOLS = [
  read('ads_conversion_setup', 'Google Ads paid-job feed', 'For managers: the private address Google Ads fetches daily to learn which ad clicks became paid jobs and their value, with the setup steps, and how many paid jobs from ads are in it now.',
    { site: { type: 'string', enum: ['dampscan', 'ati-london', 'roofing', 'ac'] } }, adsSetup),
  read('competitor_watch', 'Competitor watch', 'What competitors (The Damp Group) added to their websites since the monthly check began, by page, beside our own top Google searches and positions from Search Console.', {}, competitorWatch),
  read('owner_briefing', 'Owner briefing', 'The Monday briefing for managers, per business: enquiries, how many were booked and the conversion, money in, reports sent with the average hours from the end of the survey and how many were late, surveys unpaid, why enquiries were lost, and surveys per surveyor. weeks_ago 1 (the default) is last week.',
    { weeks_ago: { type: 'integer', minimum: 0, maximum: 52 } }, briefing),
  read('match_email', 'Match an email to a customer', 'For the inbox sweep: given an email\'s sender and words (read from the person\'s own Outlook connector), the jobs and enquiries it belongs to and where each stands, matched by email, phone number, postcode, or the estate agent\'s email.',
    { from_email: { type: 'string' }, from_name: { type: 'string' }, text: { type: 'string', description: 'The subject and body.' } }, matchEmail)
];
