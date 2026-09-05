/**
 * POST /api/lead
 *
 * Order matters: throttle, honeypot, validate, write, then notify. The database
 * write is the commitment, so nothing after it is allowed to fail the request.
 */
import { query, queryOne } from '../lib/db.js';
import { json, requireMethod, requireSameOrigin, readJson, ipHash, str } from '../lib/http.js';
import { validateLead } from '../lib/validate.js';
import { rateLimit, pruneRateHits, LIMITS } from '../lib/ratelimit.js';
import { siteFor } from '../lib/site.js';

export const config = { runtime: 'nodejs' };

const UPSERT = `
  insert into leads (
    stage, first_name, email, postcode, address_line1, address_line2, town, files,
    phone, issues, role, previous_survey,
    notes, session_id, source_path, referrer, utm, user_agent, ip_hash, site
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8::text[],
    $9, $10::text[], $11, $12,
    $13, $14::uuid, $15, $16, $17::jsonb, $18, $19, $20
  )
  on conflict (session_id, stage) do update set
    updated_at      = now(),
    first_name      = excluded.first_name,
    email           = excluded.email,
    postcode        = excluded.postcode,
    -- coalesce, so the complete submission fills these in without a later
    -- partial from the same session blanking them again.
    address_line1   = coalesce(excluded.address_line1, leads.address_line1),
    address_line2   = coalesce(excluded.address_line2, leads.address_line2),
    town            = coalesce(excluded.town, leads.town),
    -- Same reason, and an array is never null, so cardinality does the work.
    files           = case when cardinality(excluded.files) > 0
                             then excluded.files else leads.files end,
    phone           = coalesce(excluded.phone, leads.phone),
    issues          = case when cardinality(excluded.issues) > 0
                             then excluded.issues else leads.issues end,
    role            = coalesce(excluded.role, leads.role),
    previous_survey = coalesce(excluded.previous_survey, leads.previous_survey),
    notes           = coalesce(excluded.notes, leads.notes),
    source_path     = coalesce(excluded.source_path, leads.source_path),
    referrer        = coalesce(excluded.referrer, leads.referrer),
    utm             = case when excluded.utm = '{}'::jsonb then leads.utm else excluded.utm end,
    user_agent      = coalesce(excluded.user_agent, leads.user_agent),
    ip_hash         = coalesce(excluded.ip_hash, leads.ip_hash),
    site            = excluded.site
  returning id, notified_at, (xmax = 0) as inserted`;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireSameOrigin(req, res)) return;

  const hash = ipHash(req);
  const limit = await rateLimit({ ...LIMITS.lead, ipHash: hash });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(LIMITS.lead.windowSeconds));
    json(res, 429, { ok: false, error: 'too_many_requests' });
    return;
  }
  pruneRateHits();

  const body = await readJson(req);

  // Honeypot. Silent success so a bot learns nothing from the response, and
  // nothing at all is written.
  if (str(body.honeypot, 200)) {
    json(res, 200, { ok: true });
    return;
  }

  const { ok, errors, value } = validateLead(body);
  if (!ok) {
    json(res, 400, { ok: false, errors });
    return;
  }

  let row;
  try {
    row = await queryOne(UPSERT, [
      value.stage,
      value.firstName,
      value.email,
      value.postcode,
      value.addressLine1,
      value.addressLine2,
      value.town,
      value.files,
      value.phone,
      value.issues,
      value.role,
      value.previousSurvey,
      value.notes,
      value.sessionId,
      value.sourcePath,
      value.referrer,
      JSON.stringify(value.utm || {}),
      str(req.headers['user-agent'], 500),
      hash,
      siteFor(req)
    ]);
  } catch (err) {
    console.error('lead write failed:', err.message);
    json(res, 500, { ok: false, error: 'write_failed' });
    return;
  }

  const id = row.id;

  // A booked survey is now attributable: stamp the lead onto every event this
  // visitor generated, so the dashboard can credit the channel that produced it.
  if (value.stage === 'complete') {
    try {
      await query('update events set lead_id = $1 where session_id = $2::uuid and lead_id is null', [
        id,
        value.sessionId
      ]);
    } catch (err) {
      console.warn('event attribution back-fill failed:', err.message);
    }
  }

  // The notification email is sent by the browser, not from here: FormSubmit
  // sits behind Cloudflare and answers a serverless call with a bot challenge.
  // The page reports the outcome to /api/notified, which stamps notified_at or
  // notify_error on this row.

  json(res, 200, { ok: true, id });
}
