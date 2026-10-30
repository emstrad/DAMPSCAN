/**
 * Paid jobs that started from a Google Ads click, as the file Google Ads
 * imports on a schedule ("offline conversions"). Ads then learns from who
 * paid, and for how much, instead of from form fills, and bids towards
 * people like them.
 *
 * The click id (gclid) arrives on the landing address and is kept with the
 * enquiry (leads.utm); a job made from that enquiry carries it through. Jobs
 * booked by phone with no enquiry behind them have no click id and so are not
 * in the file. The file holds no customer details, only the click id, when,
 * and the value.
 *
 * The address Google fetches carries a key worked out from SESSION_SECRET for
 * that one brand, so it reads nothing else and needs no sign-in.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';

export const CONVERSION_NAME = 'Paid job';
const DAYS = 90;

/* No secret, or a guessable one, would let anyone read the feed: make no key and accept none. */
const secret = () => { const v = process.env.SESSION_SECRET; return v && v.length >= 16 ? v : null; };
export const feedKey = (site) => secret() ? createHmac('sha256', secret()).update(`ads-conversions:${site}`).digest('hex').slice(0, 32) : null;

export function keyOk(site, key) {
  if (!secret()) return false;
  const want = Buffer.from(feedKey(site));
  const got = Buffer.from(String(key || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

/* "2026-10-19 14:05:00" in London time, which the file's header names. */
const stamp = (d) => new Date(d).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).slice(0, 19);
const cell = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

export async function conversionsFor(site) {
  return query(
    `select l.utm->>'gclid' as gclid,
            coalesce(j.paid_at, (select max(p.paid_on)::timestamptz from job_payments p where p.job_id = j.id)) as paid,
            coalesce(nullif(j.invoice_net_pence, 0), j.survey_price_pence + coalesce(j.remedial_pence, 0), 0) as pence
       from jobs j join leads l on l.id = j.lead_id
      where j.site = $1 and coalesce(l.utm->>'gclid', '') <> ''
        and (j.paid_at is not null or j.status = 'paid')
        and coalesce(j.paid_at, j.updated_at) >= now() - interval '${DAYS} days'
      order by 2`, [site]);
}

export function conversionsCsv(rows) {
  const lines = ['Parameters:TimeZone=Europe/London', 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency'];
  for (const r of rows) {
    if (!r.paid) continue;
    lines.push([r.gclid, CONVERSION_NAME, stamp(r.paid), (Number(r.pence) / 100).toFixed(2), 'GBP'].map(cell).join(','));
  }
  return lines.join('\n') + '\n';
}
