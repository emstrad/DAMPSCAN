/**
 * Texts to customers through Twilio: the booking confirmation when a survey
 * is booked, and the reminder the evening before. Built and switched off:
 * nothing is sent unless SMS_AUTO=on and TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM are all set (the owners turn it on once
 * Twilio is ready). Until then the same words stay as tap-to-send links
 * (lib/messages.js), as every other customer message is.
 */
import { query } from './db.js';
import { greeting, mobileFor } from './messages.js';
import { DAMP_BRANDS } from './survey-messages.js';

export const smsLive = () => process.env.SMS_AUTO === 'on'
  && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const longDate = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The words for a damp survey text, or null. */
export function textFor(kind, job) {
  const brand = DAMP_BRANDS[job.site];
  if (!brand || !job.jobDate) return null;
  const when = `${longDate(job.jobDate)}${job.jobTime ? ` at ${job.jobTime}` : ''}`;
  if (kind === 'reminder') {
    return `${greeting(job.customerName)} a reminder that your survey with ${brand.name} is tomorrow, ${when}${job.customerPostcode ? ` at ${job.customerPostcode}` : ''}. If anything has changed, just reply or give us a call.\n\nThanks, ${brand.name}, ${brand.phoneLabel}`;
  }
  if (kind === 'confirm') {
    return `${greeting(job.customerName)} your survey with ${brand.name} is booked for ${when}${job.customerPostcode ? ` at ${job.customerPostcode}` : ''}. If anything changes, just reply or give us a call.\n\nThanks, ${brand.name}, ${brand.phoneLabel}`;
  }
  return null;
}

/** Sends one text when switched on. Returns what happened, never throws. */
export async function sendText({ to, body, fetchImpl = fetch }) {
  if (!smsLive()) return { sent: false, why: 'off' };
  const mobile = mobileFor(to);
  if (!mobile || !body) return { sent: false, why: 'no_mobile' };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  try {
    const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+' + mobile, From: process.env.TWILIO_FROM, Body: body }),
      signal: AbortSignal.timeout(8000)
    });
    return r.ok ? { sent: true } : { sent: false, why: `twilio_${r.status}` };
  } catch (err) { return { sent: false, why: err.message }; }
}

async function noMobile(j, kind) {
  const first = String(j.customerName || 'The customer').trim().split(/\s+/)[0];
  const area = String(j.customerPostcode || '').trim().split(/\s+/)[0];
  const text = `No mobile for ${first}${area ? ' (' + area + ')' : ''}: the ${kind === 'reminder' ? 'survey reminder' : 'booking confirmation'} text could not go. Email or call them instead.`;
  await query(`insert into todos (site, job_id, text, for_owners, set_by_name, source)
      select $1, $2, $3, true, 'Texts', 'manual' where not exists (select 1 from todos where job_id = $2 and text = $3)`, [j.site, j.id, text]);
}

/** One survey text, kept in the job's message history like a tapped one. */
export async function textJob(jobId, kind) {
  if (!smsLive()) return { sent: false, why: 'off' };
  const j = (await query(`select j.id, j.site, j.job_date::text as "jobDate", to_char(j.job_time, 'HH24:MI') as "jobTime", j.customer_name as "customerName",
      j.customer_postcode as "customerPostcode", coalesce(j.customer_phone, l.phone) as phone from jobs j left join leads l on l.id = j.lead_id where j.id = $1`, [jobId]))[0];
  if (!j) return { sent: false, why: 'not_found' };
  const out = await sendText({ to: j.phone, body: textFor(kind, j) });
  /* A landline or no number at all (an email-only enquiry): the text cannot go,
     so the owners get one to-do to tell them another way. */
  if (out.why === 'no_mobile') await noMobile(j, kind).catch(() => {});
  if (out.sent) await query(`insert into job_messages (job_id, kind, channel, sent_at) values ($1, $2, 'sms', now())`, [jobId, kind]).catch(() => {});
  return out;
}
