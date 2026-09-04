/**
 * GET /api/admin/leads?range=&stage=&limit=&offset=
 *
 * Paginated leads, newest first, each with the channel and landing page that
 * produced it and its session's full event timeline. Auth required.
 *
 * This is also the integration point for the SurveyMate CRM: see the README.
 */
import { query, queryOne } from '../../lib/db.js';
import { json, requireMethod } from '../../lib/http.js';
import { requireAuth } from '../../lib/session.js';
import { normaliseRange } from '../../lib/metrics.js';
import { normaliseSite } from '../../lib/site.js';

export const config = { runtime: 'nodejs' };

const MAX_LIMIT = 200;

function sinceExpr(range) {
  switch (range) {
    case 'today':
      return `(date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')`;
    case '30d':
      return `(now() - interval '30 days')`;
    case 'all':
      return `'-infinity'::timestamptz`;
    default:
      return `(now() - interval '7 days')`;
  }
}

/**
 * The channel and landing page come from the first event of the lead's session,
 * which is where the visitor actually arrived from. Attribution is resolved in
 * SQL via a lateral join rather than by fetching events per row in a loop.
 */
const LEADS = `
  select l.id, l.created_at, l.updated_at, l.stage, l.first_name, l.email, l.postcode,
         l.address_line1, l.address_line2, l.town, l.files,
         l.phone, l.issues, l.role, l.previous_survey, l.notes, l.session_id,
         l.source_path, l.referrer, l.utm, l.notified_at, l.notify_error, l.site,
         a.channel, a.landing_page, a.device,
         (select count(*) from events e where e.session_id = l.session_id) as event_count
  from leads l
  left join lateral (
    select channel, landing_page, device
      from events e
     where e.session_id = l.session_id
     order by e.created_at asc
     limit 1
  ) a on true
   where l.created_at >= $SINCE
     and ($1::text is null or l.stage = $1::text)
     and ($4::text is null or l.site = $4::text)
  order by l.created_at desc
  limit $2 offset $3`;

const COUNT = `
  select count(*) as total from leads
   where created_at >= $SINCE and ($1::text is null or stage = $1::text)
     and ($2::text is null or site = $2::text)`;

/** Timelines for the page of leads just fetched, in one round trip. */
const TIMELINES = `
  select session_id, created_at, type, detail, path, channel, device
    from events
   where session_id = any($1::uuid[])
   order by session_id, created_at asc`;

function intParam(value, fallback, max) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max === undefined ? parsed : Math.min(parsed, max);
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const session = requireAuth(req, res);
  if (!session) return;

  const params = new URL(req.url, `https://${req.headers.host}`).searchParams;
  const range = normaliseRange(params.get('range'));
  const since = sinceExpr(range);
  const stageParam = params.get('stage');
  const stage = stageParam === 'partial' || stageParam === 'complete' ? stageParam : null;
  const site = normaliseSite(params.get('site'));
  const limit = Math.max(1, intParam(params.get('limit'), 50, MAX_LIMIT));
  const offset = intParam(params.get('offset'), 0);

  try {
    const [rows, totals] = await Promise.all([
      query(LEADS.replaceAll('$SINCE', since), [stage, limit, offset, site]),
      queryOne(COUNT.replaceAll('$SINCE', since), [stage, site])
    ]);

    const sessionIds = [...new Set(rows.map((row) => row.session_id))];
    const timelines = new Map();
    if (sessionIds.length) {
      for (const event of await query(TIMELINES, [sessionIds])) {
        if (!timelines.has(event.session_id)) timelines.set(event.session_id, []);
        timelines.get(event.session_id).push({
          createdAt: event.created_at,
          type: event.type,
          detail: event.detail,
          path: event.path,
          channel: event.channel,
          device: event.device
        });
      }
    }

    json(res, 200, {
      ok: true,
      range,
      stage,
      site,
      total: Number(totals.total),
      limit,
      offset,
      leads: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        stage: row.stage,
        firstName: row.first_name,
        email: row.email,
        postcode: row.postcode,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        town: row.town,
        files: row.files || [],
        phone: row.phone,
        issues: row.issues || [],
        role: row.role,
        previousSurvey: row.previous_survey,
        notes: row.notes,
        sessionId: row.session_id,
        site: row.site,
        sourcePath: row.source_path,
        referrer: row.referrer,
        utm: row.utm || {},
        channel: row.channel,
        landingPage: row.landing_page,
        device: row.device,
        notifiedAt: row.notified_at,
        notifyError: row.notify_error,
        eventCount: Number(row.event_count),
        timeline: timelines.get(row.session_id) || []
      }))
    });
  } catch (err) {
    console.error('leads query failed:', err.message);
    json(res, 500, { ok: false, error: 'leads_failed' });
  }
}
