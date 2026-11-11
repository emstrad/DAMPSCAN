/**
 * The customer portal: one private link per ATi or DampScan survey, where the
 * customer sees the one next step, their booking, payments, history and, once
 * paid in full, their report. Served through /api/quote (doc=portal) so it
 * adds no function of its own.
 *
 * The link is its own key (a long random token, separate from the quote and
 * rating tokens) and lasts 12 months from when it was made (the owner's
 * choice). Sending a new one replaces the old. Only what the customer should
 * see leaves here: never staff notes, to-dos, pay, or anyone else's diary.
 *
 * Built in the Lab first: it goes to customers once Twilio and Revolut are
 * set up, so for now only the owners make links (lib/routes/admin/hours.js).
 */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { query, queryOne } from './db.js';
import { ipHash } from './http.js';
import { buildView } from './portal-view.js';
import { logEvent, deviceOf, recentFails } from './portal-events.js';
import { notify } from './notify.js';
import { customer, jobPage } from './alert-words.js';
import { readAttachment } from './blob.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const LIFE_MS = 365 * 86400000;
const ORIGIN = { dampscan: 'https://dampscan.co.uk', 'ati-london': 'https://atidampsurvey.co.uk' };

const day = (v) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

/** A fresh link for a survey; any older link stops working. */
export async function issuePortal(jobId) {
  const token = randomBytes(24).toString('base64url');
  const j = await queryOne(`update jobs set portal_token = $2, portal_issued_at = now(), portal_opened_at = null
                             where id = $1 and site in ('dampscan', 'ati-london') returning site`, [jobId, token]);
  return j ? `${ORIGIN[j.site]}/my.html?t=${token}` : null;
}

const SELECT = `select j.*, j.job_date::text as job_day, r.label as survey_label, a.name as agent_name, a.branch as agent_branch,
       l.address_line1, l.town, l.created_at as lead_at, l.notes as lead_notes, l.issues as lead_issues, l.files as lead_files, b.payment_details,
       coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0) as paid_pence,
       coalesce((select -sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label = 'refund'), 0) as refunded_pence
  from jobs j left join job_rates r on r.key = j.survey_type left join estate_agents a on a.id = j.estate_agent_id
  left join leads l on l.id = j.lead_id left join businesses b on b.slug = j.site
 where j.portal_token = $1 and j.site in ('dampscan', 'ati-london')`;

/** The survey behind a link, or { gone } when the link is unknown or past its 12 months (the job comes too, for a new-link request). */
export async function findPortal(token, now = Date.now()) {
  if (!TOKEN_RE.test(token || '')) return { gone: 'not_found' };
  const j = await queryOne(SELECT, [token]);
  if (!j) return { gone: 'not_found' };
  if (now - new Date(j.portal_issued_at).getTime() > LIFE_MS) return { gone: 'expired', site: j.site, job: j };
  return { job: j };
}

/** Everything the page shows, customer-safe (lib/portal-view.js), and the visit noted. */
export async function portalView(j, today, req = null) {
  if (!j.portal_opened_at) await query('update jobs set portal_opened_at = now() where id = $1', [j.id]);
  await logEvent(j.id, 'opened', { ipHash: req ? ipHash(req) : null, device: req ? deviceOf(req) : null });
  return { ...buildView(j, today), expiresOn: day(new Date(new Date(j.portal_issued_at).getTime() + LIFE_MS)) };
}

const tidyPc = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const LOCK_AFTER = 5;

function stream(res, file, name, download) {
  res.statusCode = 200;
  res.setHeader('Content-Type', file.contentType);
  if (file.size) res.setHeader('Content-Length', String(file.size));
  if (download) res.setHeader('Content-Disposition', `attachment; filename="${String(name).replace(/["\\\r\n]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(file.stream).pipe(res);
}
const refuse = (res, code, error) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error })); };

/**
 * The report file: only once paid in full and reported, and only for someone
 * who types the property's postcode, so a forwarded link alone is not enough.
 * Five wrong tries in half an hour lock downloads and tell the team.
 */
export async function portalReport(req, res, j, postcode) {
  const view = buildView(j);
  if (view.state !== 'report' || !j.report_path) return refuse(res, 404, 'not_ready');
  const meta = { ipHash: ipHash(req), device: deviceOf(req) };
  if (await recentFails(j.id) >= LOCK_AFTER) return refuse(res, 429, 'locked');
  const want = tidyPc(j.customer_postcode);
  if (!want || tidyPc(postcode) !== want) {
    await logEvent(j.id, 'postcode_fail', meta);
    if (await recentFails(j.id) >= LOCK_AFTER) {
      await logEvent(j.id, 'locked', meta);
      await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Website', 'manual', true)`,
        [j.site, j.id, `${view.firstName || 'A customer'} typed the wrong postcode 5 times trying to download their report. Downloads are locked for 30 minutes: check it is them.`]);
      return refuse(res, 429, 'locked');
    }
    return refuse(res, 403, 'wrong_postcode');
  }
  const file = await readAttachment(j.report_path);
  if (!file.ok) return refuse(res, file.reason === 'not_found' ? 404 : 502, 'unavailable');
  await logEvent(j.id, 'report', meta);
  /* The first download is the report reaching them. */
  await query('update jobs set report_downloaded_at = coalesce(report_downloaded_at, now()) where id = $1', [j.id]);
  stream(res, file, j.report_name || 'Survey report.pdf', true);
}

/** One of the photos they sent with their enquiry, by its place in the list. */
export async function portalPhoto(res, j, index) {
  const photos = (j.lead_files || []).filter((f) => /\.(jpe?g|png|gif|webp|heic)$/i.test(f));
  const path = photos[Number(index)];
  if (!path) return refuse(res, 404, 'not_found');
  const file = await readAttachment(path);
  if (!file.ok) return refuse(res, file.reason === 'not_found' ? 404 : 502, 'unavailable');
  stream(res, file, 'photo', false);
}

/**
 * An expired link asks for a new one. The team sends it (nothing goes to a
 * customer by itself): one to-do and one alert, at most once a day.
 */
export async function requestNewLink(req, j) {
  const recent = await queryOne(`select 1 from portal_events where job_id = $1 and kind = 'newlink' and at > now() - interval '24 hours'`, [j.id]);
  await logEvent(j.id, 'newlink', { ipHash: ipHash(req), device: deviceOf(req) });
  if (recent) return { ok: true, already: true };
  const view = buildView(j);
  await query(`insert into todos (site, job_id, text, set_by_name, source, for_owners) values ($1, $2, $3, 'Website', 'manual', true)`,
    [j.site, j.id, `${view.firstName || 'A customer'} asked for a new link to their survey page (theirs had expired). Make one in the job card and send it.`]);
  await notify({ business: j.site, kind: 'portal_link', ref: j.id, tags: 'link', priority: 3, path: jobPage(j.site, j.id),
    title: `New link requested: ${view.brand.name}`, message: `${customer(j.customer_name, j.customer_postcode)} asked for a new link to their survey page.` });
  return { ok: true };
}

/** Damp surveys matching a name or postcode, for the Lab's link maker. */
export async function portalSearch(q) {
  const like = `%${String(q || '').trim().replace(/[%_]/g, '')}%`;
  if (like.length < 4) return [];
  return (await query(`select id, customer_name, customer_postcode, job_date::text as job_date, portal_token is not null as has_link
      from jobs where site in ('dampscan', 'ati-london') and (customer_name ilike $1 or replace(customer_postcode, ' ', '') ilike replace($1, ' ', ''))
      order by id desc limit 8`, [like])).map((r) => ({ id: Number(r.id), name: r.customer_name, postcode: r.customer_postcode, date: r.job_date, hasLink: r.has_link }));
}
