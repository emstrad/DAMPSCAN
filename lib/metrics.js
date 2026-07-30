/**
 * Dashboard aggregation.
 *
 * Every count here is worked out by Postgres. Nothing pulls a table into
 * JavaScript to count it, so the dashboard stays fast as the events table grows.
 */
import { query, queryOne } from './db.js';
import { normaliseSite } from './site.js';

export const RANGES = ['today', '7d', '30d', 'all'];

/**
 * Lower bound for a range, as a SQL expression rather than a parameter. The
 * value comes from a fixed whitelist and is never visitor input, so there is
 * nothing here to inject. "today" is a London day, not a UTC one.
 */
function sinceExpr(range) {
  switch (range) {
    case 'today':
      return `(date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')`;
    case '30d':
      return `(now() - interval '30 days')`;
    case 'all':
      return `'-infinity'::timestamptz`;
    case '7d':
    default:
      return `(now() - interval '7 days')`;
  }
}

export function normaliseRange(value) {
  return RANGES.includes(value) ? value : '7d';
}

/** Substitutes the range bound into a statement. */
const build = (sql, range, site) =>
  sql.replaceAll('$SINCE', sinceExpr(range))
     .replaceAll('$SITE_E', siteClause(site, 'e.'))
     .replaceAll('$SITE', siteClause(site));

/** Sessions that went on to book. Joined in wherever a booking rate is needed. */
const BOOKED = `(select distinct session_id from leads where stage = 'complete' and $SITE)`;

/**
 * Staff sign-ins live in the same events table but are not visits. Without this
 * every sign in would add a phantom session, inflating the session count, diluting
 * the conversion rates and quietly padding the direct channel.
 */
const VISITOR_ONLY = `type not in ('staff_login','staff_login_failed')`;

/**
 * Optional site filter. $SITE is replaced with a real predicate or with `true`,
 * so one set of statements serves both "just London" and "both sites".
 */
const siteClause = (site, prefix = '') => (site ? `${prefix}site = ${quoteSite(site)}` : 'true');

/** Only ever receives a value already checked against the whitelist. */
function quoteSite(site) {
  if (!normaliseSite(site)) throw new Error(`unknown site: ${site}`);
  return `'${site}'`;
}

const rate = (numerator, denominator) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

const COUNTERS = `
  select
    count(*) filter (where type = 'page_view')                            as page_views,
    count(distinct session_id)                                            as sessions,
    count(*) filter (where type = 'call_click')                           as call_clicks,
    count(distinct session_id) filter (where type = 'form_open')          as form_opens,
    count(distinct session_id) filter (where type = 'email_click')        as email_clicks,
    count(distinct session_id) filter (where type = 'cta_click')          as cta_clicks
  from events where created_at >= $SINCE and ${VISITOR_ONLY} and $SITE`;

const LEAD_COUNTS = `
  select
    count(*) filter (where stage = 'partial')  as partials,
    count(*) filter (where stage = 'complete') as bookings
  from leads where created_at >= $SINCE and $SITE`;

const FUNNEL = `
  select
    count(distinct session_id) filter (where type = 'form_step' and detail->>'step' = '1') as step1,
    count(distinct session_id) filter (where type = 'form_step' and detail->>'step' = '2') as step2,
    count(distinct session_id) filter (where type = 'form_step' and detail->>'step' = '3') as step3,
    count(distinct session_id) filter (where type = 'form_submit')                         as submitted
  from events where created_at >= $SINCE and $SITE`;

const FORM_ERRORS = `
  select coalesce(detail->>'field', 'unknown') as field,
         count(*)                    as errors,
         count(distinct session_id)  as sessions
  from events
   where type = 'form_error' and created_at >= $SINCE and $SITE
  group by 1 order by errors desc, field asc`;

const CALL_LOG = `
  select e.created_at,
         coalesce(e.detail->>'placement', 'page') as placement,
         coalesce(e.device, 'unknown')            as device,
         coalesce(e.channel, 'unknown')           as channel,
         e.session_id,
         (b.session_id is not null)               as booked
  from events e
  left join ${BOOKED} b on b.session_id = e.session_id
   where e.type = 'call_click' and e.created_at >= $SINCE and $SITE_E
  order by e.created_at desc
  limit $1`;

/** Shared shape for the three source breakdowns: only the grouping key changes. */
const breakdown = (keyExpr, having = '') => `
  select ${keyExpr} as key,
         count(distinct e.session_id)                                        as sessions,
         count(*) filter (where e.type = 'call_click')                       as call_clicks,
         count(distinct e.session_id) filter (where b.session_id is not null) as bookings
  from events e
  left join ${BOOKED} b on b.session_id = e.session_id
   where e.created_at >= $SINCE and e.${VISITOR_ONLY} and $SITE_E
  group by 1
  ${having}
  order by sessions desc, key asc
  limit 40`;

const BY_CHANNEL = breakdown(`coalesce(e.channel, 'unknown')`);

const BY_REFERRER = breakdown(
  `lower(split_part(regexp_replace(coalesce(e.referrer, ''), '^https?://(www\\.)?', ''), '/', 1))`,
  `having lower(split_part(regexp_replace(coalesce(e.referrer, ''), '^https?://(www\\.)?', ''), '/', 1)) <> ''`
);

const BY_CAMPAIGN = breakdown(
  `coalesce(e.utm->>'utm_campaign', '')`,
  `having coalesce(e.utm->>'utm_campaign', '') <> ''`
);

const BY_LANDING = breakdown(`coalesce(e.landing_page, '(unknown)')`);

const BY_DEVICE = breakdown(`coalesce(e.device, 'unknown')`);

const CALL_LOG_LIMIT = 500;

function withRate(rows) {
  return rows.map((row) => ({
    key: row.key,
    sessions: Number(row.sessions),
    callClicks: Number(row.call_clicks),
    bookings: Number(row.bookings),
    bookingRate: rate(Number(row.bookings), Number(row.sessions))
  }));
}

export async function summary(rangeInput, siteInput) {
  const range = normaliseRange(rangeInput);
  const site = normaliseSite(siteInput);
  const at = (sql) => build(sql, range, site);

  const [counters, leadCounts, funnel, formErrors, callLog, channels, referrers, campaigns, landing, devices] =
    await Promise.all([
      queryOne(at(COUNTERS)),
      queryOne(at(LEAD_COUNTS)),
      queryOne(at(FUNNEL)),
      query(at(FORM_ERRORS)),
      query(at(CALL_LOG), [CALL_LOG_LIMIT]),
      query(at(BY_CHANNEL)),
      query(at(BY_REFERRER)),
      query(at(BY_CAMPAIGN)),
      query(at(BY_LANDING)),
      query(at(BY_DEVICE))
    ]);

  const sessions = Number(counters.sessions);
  const partials = Number(leadCounts.partials);
  const bookings = Number(leadCounts.bookings);
  const step1 = Number(funnel.step1);
  const step2 = Number(funnel.step2);
  const step3 = Number(funnel.step3);

  return {
    range,
    site,
    generatedAt: new Date().toISOString(),
    counters: {
      pageViews: Number(counters.page_views),
      sessions,
      callClicks: Number(counters.call_clicks),
      formOpens: Number(counters.form_opens),
      ctaClicks: Number(counters.cta_clicks),
      emailClicks: Number(counters.email_clicks),
      partials,
      bookings,
      sessionToPartial: rate(partials, sessions),
      partialToComplete: rate(bookings, partials)
    },
    funnel: {
      step1,
      step2,
      step3,
      submitted: Number(funnel.submitted),
      dropStep1To2: step1 > 0 ? rate(step1 - step2, step1) : 0,
      dropStep2To3: step2 > 0 ? rate(step2 - step3, step2) : 0,
      dropStep3ToSubmit: step3 > 0 ? rate(step3 - Number(funnel.submitted), step3) : 0,
      errorsByField: formErrors.map((row) => ({
        field: row.field,
        errors: Number(row.errors),
        sessions: Number(row.sessions)
      }))
    },
    calls: {
      // The log is capped so one busy month cannot blow up the response. The
      // dashboard says so out loud rather than quietly showing a partial list.
      limit: CALL_LOG_LIMIT,
      truncated: callLog.length >= CALL_LOG_LIMIT,
      rows: callLog.map((row) => ({
        createdAt: row.created_at,
        placement: row.placement,
        device: row.device,
        channel: row.channel,
        sessionId: row.session_id,
        booked: row.booked
      }))
    },
    sources: {
      byChannel: withRate(channels),
      byReferrer: withRate(referrers),
      byCampaign: withRate(campaigns)
    },
    landingPages: withRate(landing),
    devices: withRate(devices)
  };
}
