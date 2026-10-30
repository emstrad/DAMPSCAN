/**
 * GET  /api/admin/leads?range=&stage=&status=&limit=&offset=
 * POST /api/admin/leads {op: close|reopen|delete, id, reason?}
 *
 * Paginated leads, newest first, each with the channel and landing page that
 * produced it, its session's full event timeline and its status: open,
 * converted (a job came from it) or closed. ?status= filters on that and
 * defaults to all. POST closes, reopens or (managers only) deletes one; the
 * work is in lib/lead-status.js, shared with the assistant's tools.
 *
 * This is also the integration point for the SurveyMate CRM: see the README.
 */
import { jobStage, leadStage } from '../../journey.js';
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { workOnly } from '../../work-only.js';
import { normaliseRange } from '../../metrics.js';
import { normaliseSite } from '../../site.js';
import { emailStatus } from '../../email-status.js';
import { statusSql, STATUSES, closeLead, reopenLead, deleteLead, scheduleLead } from '../../lead-status.js';

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
  select * from (
  select l.id, l.created_at, l.updated_at, l.stage, l.first_name, l.email, l.postcode,
         l.address_line1, l.address_line2, l.town, l.files,
         l.phone, l.issues, l.role, l.previous_survey, l.notes, l.session_id,
         l.source_path, l.referrer, l.utm, l.notified_at, l.notify_error, l.notify_beacon_at, l.site,
         l.closed_at, l.closed_reason, l.closed_by, ${statusSql('l')} as status,
         l.sched_stage, l.pencil_date, l.pencil_until, to_jsonb(jb) as job,
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
  left join lateral (
    select id, status, paid_at, survey_sent_at, date_set, job_date::text as job_date, job_time, awaiting_agent, pencil_date, pencil_until, sched_stage
      from jobs where lead_id = l.id order by id limit 1
  ) jb on true
   where l.created_at >= $SINCE
     and ($1::text is null or l.stage = $1::text)
     and l.site = any($4::text[])
  ) x where $5::text = 'all' or x.status = $5::text
  order by x.created_at desc
  limit $2 offset $3`;

const COUNT = `
  select count(*) as total from leads l
   where l.created_at >= $SINCE and ($1::text is null or l.stage = $1::text)
     and l.site = any($2::text[]) and ($3::text = 'all' or ${statusSql('l')} = $3::text)`;

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

const OPS = { close: (scope, b) => closeLead(scope, b.id, str(b.reason, 200)), reopen: (scope, b) => reopenLead(scope, b.id), delete: (scope, b) => deleteLead(scope, b.id), schedule: (scope, b) => scheduleLead(scope, b.id) };

async function change(req, res, scope) {
  try {
    const body = await readJson(req);
    const op = OPS[body.op];
    if (!op) return json(res, 400, { ok: false, error: 'bad_op' });
    const out = await op(scope, { ...body, id: Number(body.id) });
    if (out.error) return json(res, out.status || 400, { ok: false, error: out.error });
    return json(res, 200, { ok: true, ...out });
  } catch (err) {
    console.error('lead change failed:', err.message);
    return json(res, 500, { ok: false, error: 'lead_change_failed' });
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  /* Leads is the managers' marketing view, full of enquiry notes and contacts. */
  if (req.method === 'POST') return change(req, res, scope);
  if (workOnly(scope)) return json(res, 403, { ok: false, error: 'forbidden' });

  const params = new URL(req.url, `https://${req.headers.host}`).searchParams;
  const range = normaliseRange(params.get('range'));
  const since = sinceExpr(range);
  const stageParam = params.get('stage');
  const stage = stageParam === 'partial' || stageParam === 'complete' ? stageParam : null;
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : 'all';
  /* What the request may see, narrowed to one business if it asked for one
     inside its scope. Asking for one outside it yields nothing, not an error. */
  const site = normaliseSite(params.get('site'));
  const sites = requestedSites(scope, params);
  const limit = Math.max(1, intParam(params.get('limit'), 50, MAX_LIMIT));
  const offset = intParam(params.get('offset'), 0);

  try {
    const [rows, totals] = await Promise.all([
      query(LEADS.replaceAll('$SINCE', since), [stage, limit, offset, sites, status]),
      queryOne(COUNT.replaceAll('$SINCE', since), [stage, sites, status])
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
      status,
      site,
      total: Number(totals.total),
      limit,
      offset,
      leads: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        stage: row.stage,
        status: row.status,
        closedAt: row.closed_at,
        closedReason: row.closed_reason,
        closedBy: row.closed_by,
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
        channel: row.source_path === 'phone' ? 'Phone call' : row.channel,
        landingPage: row.landing_page,
        device: row.device,
        notifiedAt: row.notified_at,
        notifyError: row.notify_error,
        emailed: emailStatus(row),
        eventCount: Number(row.event_count),
        /* Where this enquiry is now, the same word Scheduling and the pop-up use. */
        journey: row.job ? jobStage(row.job) : leadStage(row),
        jobId: row.job ? Number(row.job.id) : null,
        timeline: timelines.get(row.session_id) || []
      }))
    });
  } catch (err) {
    console.error('leads query failed:', err.message);
    json(res, 500, { ok: false, error: 'leads_failed' });
  }
}
