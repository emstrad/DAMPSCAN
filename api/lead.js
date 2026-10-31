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
import { sendLeadEmail } from '../lib/lead-email.js';
import { notify } from '../lib/notify.js';
import { enquiryAlert } from '../lib/alert-enquiry.js';
import { textOwners, enquiryText } from '../lib/staff-sms.js';
import { alertPartials } from '../lib/daily-alerts.js';
import { timesFor, pickTime, saveSurvey } from '../lib/web-booking.js';
import { mergeDuplicates } from '../lib/merge-dupes.js';
import { londonToday } from '../lib/pipeline.js';

export const config = { runtime: 'nodejs' };

const UPSERT = `
  insert into leads (
    stage, first_name, email, postcode, address_line1, address_line2, town, files,
    phone, issues, role, previous_survey,
    notes, session_id, source_path, referrer, utm, user_agent, ip_hash, site,
    notify_beacon_at
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8::text[],
    $9, $10::text[], $11, $12,
    $13, $14::uuid, $15, $16, $17::jsonb, $18, $19, $20,
    case when $21::boolean then now() end
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
    site            = excluded.site,
    notify_beacon_at = coalesce(excluded.notify_beacon_at, leads.notify_beacon_at)
  returning id, notified_at, (xmax = 0) as inserted, first_name, postcode, phone, issues`;

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

  /* After the enquiry: the survey times to pick from, and the pick itself
     (lib/web-booking.js). Here rather than a new file: the plan allows twelve. */
  if (body.op === 'times' || body.op === 'pick' || body.op === 'survey') {
    const today = londonToday();
    try {
      const out = body.op === 'survey' ? await saveSurvey({ leadId: body.leadId, sessionId: body.sessionId, choice: body.choice })
        : body.op === 'times'
        ? await timesFor({ leadId: body.leadId, sessionId: body.sessionId, today })
        : await pickTime({ leadId: body.leadId, sessionId: body.sessionId, date: str(body.date, 10), time: str(body.time, 5), ticket: str(body.ticket, 80), today });
      json(res, out.error ? (out.error === 'not_found' ? 404 : 409) : 200, { ok: !out.error, ...out });
    } catch (err) {
      console.error('web booking failed:', err.message);
      json(res, 500, { ok: false, error: 'booking_failed' });
    }
    return;
  }

  // Honeypot. Silent success so a bot learns nothing from the response, and
  // nothing at all is written.
  if (str(body.honeypot, 200)) {
    json(res, 200, { ok: true });
    return;
  }

  const site = siteFor(req);
  const { ok, errors, value } = validateLead(body, site);
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
      site,
      // Set by the beacon a dropout leaves with, when its email went too. Only
      // ever a note about the email, so a forged true costs nothing.
      body.emailedOnLeave === true
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

  // The notification email goes from here first, the moment the lead lands,
  // so it no longer depends on the visitor's tab staying open. `emailed` tells
  // the page not to send its own. If this send fails, the reason is stamped
  // and the page sends it as before, reporting to /api/notified, which
  // overwrites the reason with the outcome. Skipped when the lead was already
  // emailed, and for a dropout whose page fired its own email as it closed,
  // because either would be a second copy of the same email.
  let emailed = false;
  if (!row.notified_at && body.emailedOnLeave !== true) {
    const sent = await sendLeadEmail({ site, stage: value.stage, value, id });
    emailed = sent.ok;
    try {
      if (sent.ok) {
        await query('update leads set notified_at = now(), notify_error = null where id = $1', [id]);
      } else {
        await query('update leads set notify_error = $2 where id = $1 and notified_at is null',
          [id, 'Server send: ' + sent.error]);
      }
    } catch (err) {
      console.warn('lead email bookkeeping failed:', err.message);
    }
  }

  /* A finished enquiry buzzes the phones of whoever holds this business.
     Once only: a complete row is new once per visit. First name and
     district only, because it lands on a lock screen; the number rides in
     the Call button's tel: link and is never shown as text. */
  /* The same person's earlier open enquiry folds into this one (lib/merge-dupes.js). */
  if (value.stage === 'complete' && row.inserted) {
    try { await mergeDuplicates(id); } catch (err) { console.warn('duplicate merge failed:', err.message); }
  }

  if (value.stage === 'complete' && row.inserted) {
    /* Through notify, so ntfy buzzes as well as the staff app: the one alert
       that does not depend on the enquiry email arriving. */
    await notify(enquiryAlert(site, id, row));
    /* And a text to the owners, which arrives whatever ntfy's limit (lib/staff-sms.js). */
    await textOwners(enquiryText(site, id, row));
  }

  /* There is no frequent schedule to catch a form left half done, so a new
     partial is the moment to tell the owner about this business's earlier
     ones that have sat over an hour unfinished. Never blocks the reply on
     failure; the daily run catches whatever this misses. */
  if (value.stage === 'partial' && row.inserted) {
    try { await alertPartials(site); } catch (err) { console.warn('partial alerts failed:', err.message); }
  }

  json(res, 200, { ok: true, id, emailed });
}
