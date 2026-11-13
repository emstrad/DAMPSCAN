/**
 * Customer texts (the owners' plan, 11 Nov 2026): one outbox for every kind
 * (lib/text-words.js). A text from a staff action waits two minutes, so an
 * undo or a second change cancels or replaces it; one the customer caused (a
 * payment, the website form) goes at once. Each is checked again just before
 * it goes, from the survey as it is then, and its words are filled in then,
 * so a text never says something no longer true. The Texts page shows what
 * is waiting and sent, and lets the wording and any waiting text be changed.
 *
 * Off until SMS_AUTO=on with TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, and
 * the brand's sender (TWILIO_FROM_ATI, TWILIO_FROM_DAMPSCAN, else
 * TWILIO_FROM). While off, the outbox still fills and marks each "off", so
 * the wording can be checked first. SMS_TEST_TO sends every text to that one
 * number instead of the customer's, for testing on the owners' phones.
 */
import { query, queryOne } from './db.js';
import { mobileFor } from './messages.js';
import { firstName, moneyOf } from './portal-view.js';
import { portalLinkFor } from './portal.js';
import { DEFAULTS, KINDS, render, dayWords } from './text-words.js';
import { leadText, jobKind, jobVars } from './text-pick.js';

export const STAFF_DELAY_MS = 2 * 60 * 1000;
const DAMP = ['dampscan', 'ati-london'];
const FROM = { 'ati-london': 'TWILIO_FROM_ATI', dampscan: 'TWILIO_FROM_DAMPSCAN' };
const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

export const senderFor = (site) => (process.env[FROM[site]] || process.env.TWILIO_FROM || '').trim();
export const textsLive = () => process.env.SMS_AUTO === 'on' && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

const JOB = `select j.*, j.job_date::text as job_day, to_char(j.job_time, 'HH24:MI') as hhmm, r.label as survey_label,
    coalesce(j.customer_phone, l.phone) as phone, l.first_name as lead_first,
    coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
       + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence
    , a.phone as agent_phone
  from jobs j left join leads l on l.id = j.lead_id left join job_rates r on r.key = j.survey_type
  left join estate_agents a on a.id = j.estate_agent_id where j.id = $1`;

/** The wording for one kind and brand: the owners' own, else the starting words. */
export async function templateFor(kind, site) {
  const row = await queryOne('select body from sms_templates where kind = $1 and site = $2', [kind, site]);
  return row ? row.body : DEFAULTS[kind];
}

/**
 * Puts a text in the outbox, at most once for the same survey, kind and
 * moment (key). Returns the row, or null when it was already there.
 */
export async function queueText({ kind, site, jobId = null, leadId = null, key = '', delayMs = 0, by = null, payload = null }) {
  if (!KINDS[kind] || !DAMP.includes(site)) return null;
  /* Stopped on the Texts page stays stopped: a later edit never puts it back. */
  const stopped = await queryOne(`select 1 from sms_outbox where coalesce(job_id, 0) = coalesce($1::bigint, 0) and coalesce(lead_id, 0) = coalesce($2::bigint, 0)
      and kind = $3 and dedupe = $4 and status = 'cancelled' and error like 'Stopped by%' limit 1`, [jobId, leadId, kind, String(key)]);
  if (stopped) return null;
  return queryOne(`insert into sms_outbox (site, job_id, lead_id, kind, dedupe, send_after, created_by, payload)
      values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), $7, $8)
      on conflict do nothing returning id`, [site, jobId, leadId, kind, String(key), Math.round(delayMs / 1000), by, payload ? JSON.stringify(payload) : null]);
}

/* Is this text still true now? If not it is cancelled with the reason. */
function stillTrue(kind, j, p) {
  if (!j) return 'The survey is gone.';
  if (['cancelled', 'declined', 'refunded'].includes(j.status) && kind !== 'enquiry') return 'The survey was cancelled.';
  const dated = j.date_set && j.job_day && j.hhmm;
  const m = moneyOf(j);
  if (kind === 'booked' && !dated) return 'It no longer has a date.';
  if (['booked', 'moved'].includes(kind) && j.awaiting_agent) return 'Waiting on the estate agent: the booked text goes once the time is confirmed.';
  if (kind === 'moved' && (!dated || `${j.job_day} ${j.hhmm}` !== (p && p.when))) return 'It moved again (the newer move is texted instead).';
  if (kind === 'paid' && m.paidPence < Number((p && p.paid) || 0)) return 'The payment was taken off again.';
  if ((kind === 'today' || kind === 'today_unpaid') && (!dated || j.job_day !== londonToday())) return 'It is no longer today.';
  if (['ready', 'ready_paid', 'report'].includes(kind) && j.report_held) return 'The report is on hold.';
  if (kind === 'ready' && m.paidInFull) return 'Paid in full meanwhile: the report text goes instead.';
  const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^44/, '0');
  if (j.agent_phone && digits(j.agent_phone) === digits(j.phone)) return 'That number is the estate agent\'s: texts go only to the customer.';
  if (['ready', 'ready_paid'].includes(kind) && !(j.survey_sent_at || j.report_ready_at)) return 'The report is no longer marked ready.';
  if (kind === 'report' && !(m.paidInFull && (j.survey_sent_at || j.report_ready_at))) return 'It is not paid in full with a report ready.';
  if (kind === 'deposit_reminder' && (m.depositPaid || !dated || j.awaiting_agent || dayWords(j.job_day) === 'today' || dayWords(j.job_day) === 'tomorrow')) return 'Paid, or too close: the morning text asks for it.';
  if (kind === 'balance_reminder' && (m.paidInFull || j.report_held || !(j.survey_sent_at || j.report_ready_at))) return 'Paid, held or no longer ready.';
  return null;
}

/** The words a waiting text would go with now (also the Texts page preview); the wording fits the situation (lib/text-pick.js). */
export async function wordsFor(row) {
  if (row.body) return row.body;
  if (row.kind === 'enquiry' || row.kind === 'partial') {
    const t = await leadText(row);
    return t.vars ? render(await templateFor(t.kind, row.site), t.vars) : '';
  }
  const j = await queryOne(JOB, [row.job_id]);
  if (!j) return '';
  const m = moneyOf(j);
  /* The short form (/m/<token>) of their page link. */
  const link = String(await portalLinkFor(j.id) || '').replace('/my.html?t=', '/m/');
  return render(await templateFor(jobKind(row.kind, j, m), row.site), jobVars(j, m, link));
}

/** One text through Twilio, with a delivery receipt back to us. Never throws. */
export async function twilio({ to, from, body, callback, fetchImpl = fetch }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  try {
    const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+' + to, From: from, Body: body, ...(callback ? { StatusCallback: callback } : {}) }),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { sent: true, sid: d.sid || null } : { sent: false, why: d.message || `Twilio said ${r.status}` };
  } catch (err) { return { sent: false, why: err.message }; }
}

const mark = (id, status, extra = {}) => query(`update sms_outbox set status = $2, error = $3, sid = coalesce($4, sid), body = coalesce($5, body), to_phone = coalesce($6, to_phone),
    sent_at = case when $2 in ('sent', 'off') then now() else sent_at end where id = $1`, [id, status, extra.error || null, extra.sid || null, extra.body || null, extra.to || null]);

/* A customer with no mobile: one to-do to email or call them instead, once per survey. */
async function noMobile(row, j) {
  if (!textsLive()) return;
  const text = `No mobile for ${firstName(j && j.customer_name) || 'this customer'}: they get no texts. Email or call them instead.`;
  await query(`insert into todos (site, job_id, lead_id, text, for_owners, set_by_name, source)
      select $1, $2::bigint, $3::bigint, $4, true, 'Texts', 'manual' where not exists (select 1 from todos where coalesce(job_id, 0) = coalesce($2::bigint, 0)
        and coalesce(lead_id, 0) = coalesce($3::bigint, 0) and text like 'No mobile for %')`, [row.site, row.job_id, row.lead_id, text]);
}

/** Sends one waiting text now (or marks why not). */
export async function sendRow(row, { fetchImpl = fetch, base = process.env.STATUS_BASE || 'https://dampscan.co.uk' } = {}) {
  const j = row.job_id ? await queryOne(JOB, [row.job_id]) : null;
  let phone = j && j.phone;
  if (row.kind === 'enquiry' || row.kind === 'partial') {
    const t = await leadText(row);
    if (t.skip) return mark(row.id, 'cancelled', { error: t.skip });
    /* Still filling the form in: looked at again in five minutes. */
    if (t.later) return query("update sms_outbox set status = 'waiting', send_after = now() + interval '5 minutes' where id = $1", [row.id]);
    phone = t.phone;
  } else {
    const why = stillTrue(row.kind, j, row.payload);
    if (why) return mark(row.id, 'cancelled', { error: why });
  }
  const to = mobileFor(process.env.SMS_TEST_TO || phone);
  const body = await wordsFor(row);
  /* A half-finished form with a landline makes no to-do: they never asked us to call. */
  if (!to) { if (row.kind !== 'partial') await noMobile(row, j); return mark(row.id, row.kind === 'partial' ? 'cancelled' : 'failed', { error: 'No mobile number.', body }); }
  if (!textsLive() || !senderFor(row.site)) return mark(row.id, 'off', { error: 'Texts are switched off: this is what would have gone.', body, to });
  const out = await twilio({ to, from: senderFor(row.site), body, callback: base ? `${base}/api/quote?doc=sms-status&id=${row.id}` : null, fetchImpl });
  if (!out.sent) {
    /* Twilio refused it (a sender not approved, no credit, a bad number): a person is told, as for one that never arrived. */
    await query(`insert into todos (site, job_id, lead_id, text, for_owners, set_by_name, source) values ($1, $2, $3, $4, true, 'Texts', 'manual')`,
      [row.site, row.job_id, row.lead_id, `A "${KINDS[row.kind].label}" text couldn't be sent (${String(out.why || 'Twilio refused it').slice(0, 120)}): call them instead, and check the Texts page.`]);
    return mark(row.id, 'failed', { error: out.why, body, to });
  }
  return mark(row.id, 'sent', { sid: out.sid, body, to });
}

/** Sends every text whose wait is over. Cheap when there are none. */
export const QUIET = { from: 21, until: 7 };
export async function flushDue({ limit = 10, fetchImpl, now = new Date() } = {}) {
  /* Never a text at night: anything due waits for 7 o'clock (the morning run's hour). */
  const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
  if (process.env.SMS_QUIET_HOURS !== 'off' && (hour >= QUIET.from || hour < QUIET.until)) return 0;
  /* A send that died part way (a crash, a timeout) is tried again after ten minutes. */
  await query(`update sms_outbox set status = 'waiting' where status = 'sending' and send_after < now() - interval '10 minutes' and sid is null`);
  /* Claimed first, so two requests at once never send the same text twice. */
  const rows = await query(`update sms_outbox set status = 'sending' where id in (
      select id from sms_outbox where status = 'waiting' and send_after <= now() order by send_after limit $1 for update skip locked) returning *`, [limit]);
  /* A hiccup of ours (the database out for a moment) is not the customer's
     text failing: one that never reached Twilio waits five minutes and goes
     again, for up to a day, then fails for a person to see. */
  for (const row of rows) {
    await sendRow(row, { fetchImpl }).catch(async (err) => {
      console.warn('text failed:', err.message);
      const again = await query(`update sms_outbox set status = 'waiting', send_after = now() + interval '5 minutes', error = $2
          where id = $1 and sid is null and created_at > now() - interval '1 day' returning id`, [row.id, 'Trying again: ' + err.message]).catch(() => []);
      if (!again.length) await mark(row.id, 'failed', { error: err.message }).catch(() => {});
    });
  }
  return rows.length;
}

/** A Twilio delivery receipt: delivered, or failed with a to-do. */
export async function deliveryReceipt(id, status, errorCode) {
  const row = await queryOne('select * from sms_outbox where id = $1', [id]);
  if (!row) return;
  const failed = ['failed', 'undelivered'].includes(status);
  /* Receipts can come out of order: a final answer (delivered, failed) is never stepped back, and a failure tells a person once. */
  if (['delivered', 'failed', 'undelivered'].includes(row.delivery)) return;
  await query('update sms_outbox set delivery = $2, delivered_at = case when $2 = \'delivered\' then now() else delivered_at end, error = coalesce($3, error) where id = $1',
    [id, status, failed ? `Not delivered${errorCode ? ` (Twilio ${errorCode})` : ''}` : null]);
  if (failed) {
    await query(`insert into todos (site, job_id, lead_id, text, for_owners, set_by_name, source) values ($1, $2, $3, $4, true, 'Texts', 'manual')`,
      [row.site, row.job_id, row.lead_id, `A "${KINDS[row.kind].label}" text didn't arrive: call them instead.`]);
  }
}

export const MORNING_HOUR = 7;
/* The hourly run can be late (GitHub's schedule slips), so any run from 7 until
   noon sends what 7 o'clock did not; the day is the key, so it is still once. */
export const MORNING_UNTIL = 12;
/**
 * The morning texts for today's surveys: paid ones, and ones asking for the
 * deposit. One per survey per day whichever kind it was, never once the visit
 * has started, never for a time still being agreed with the estate agent.
 */
export async function morningTexts(today = londonToday(), { at = null } = {}) {
  const rows = await query(`select j.id, j.site from jobs j where j.site = any($1::text[]) and j.status = 'booked' and j.date_set and j.job_time is not null
      and j.job_date = $2::date and not coalesce(j.awaiting_agent, false)
      and j.job_time > coalesce($4::time, (now() at time zone 'Europe/London')::time)
      and not exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind in ('today', 'today_unpaid') and o.dedupe = $3)
      and not exists (select 1 from sms_outbox o where o.job_id = j.id and o.kind in ('booked', 'moved') and o.status in ('sent', 'waiting', 'sending')
        and (coalesce(o.sent_at, o.send_after) at time zone 'Europe/London')::date = $2::date)`, [DAMP, today, today, at]);
  let n = 0;
  for (const r of rows) {
    const j = await queryOne(JOB, [r.id]);
    const kind = moneyOf(j).depositPaid ? 'today' : 'today_unpaid';
    if (await queueText({ kind, site: r.site, jobId: r.id, key: today })) n += 1;
  }
  return n;
}

/* A change counts only if it happened in the last two days: an edit to an old
   survey must never text about a payment or report from months ago. */
const RECENT_MS = 2 * 86400000;
const recent = (at) => at && Date.now() - new Date(at).getTime() < RECENT_MS;

/**
 * After any change to a survey: a payment that grew, or a report newly
 * ready, queues its text. Safe to call again and again (each is once).
 */
export async function textsAfterChange(jobId, { delayMs = STAFF_DELAY_MS, by = null } = {}) {
  const j = await queryOne(JOB, [jobId]);
  if (!j || !DAMP.includes(j.site) || ['cancelled', 'declined', 'refunded'].includes(j.status)) return;
  const m = moneyOf(j);
  /* A booked text held back while the estate agent confirmed: it goes once they have (never for a booking made before texts began). */
  if (j.status === 'booked' && j.date_set && j.hhmm && !j.awaiting_agent && j.job_day >= londonToday()) {
    const held = await queryOne(`select 1 from sms_outbox where job_id = $1 and kind = 'booked' and status = 'cancelled' and error like 'Waiting on the estate agent%'
        and not exists (select 1 from sms_outbox o where o.job_id = $1 and o.kind = 'booked' and o.status <> 'cancelled') limit 1`, [jobId]);
    if (held) await queueText({ kind: 'booked', site: j.site, jobId, key: 'booked after the agent', delayMs, by });
  }
  const lastPay = await queryOne('select max(created_at) as at from job_payments where job_id = $1', [jobId]);
  const paidRecently = recent(j.deposit_paid_at) || recent(j.paid_at) || recent(lastPay && lastPay.at);
  if (m.paidPence !== Number(j.texted_paid_pence || 0)) {
    await query('update jobs set texted_paid_pence = $2 where id = $1', [jobId, m.paidPence]);
    if (m.paidPence > Number(j.texted_paid_pence || 0) && paidRecently && !(j.survey_sent_at || j.report_ready_at)) {
      await queueText({ kind: 'paid', site: j.site, jobId, key: String(m.paidPence), delayMs, by, payload: { paid: m.paidPence } });
    }
  }
  /* The report texts, once per survey each: ready (balance due) when it is
     made ready unpaid; then, paid in full, "your report" (after asking for the
     balance, however long ago that was) or "ready to view" (never asked). */
  const readyAt = j.report_ready_at || j.survey_sent_at;
  if (readyAt && !j.report_held) {
    const had = new Set((await query(`select kind from sms_outbox where job_id = $1 and kind in ('ready', 'ready_paid', 'report') and status <> 'cancelled'`, [jobId])).map((r) => r.kind));
    if (!m.paidInFull) {
      if (!had.has('ready') && recent(readyAt)) await queueText({ kind: 'ready', site: j.site, jobId, key: 'ready', delayMs, by });
    } else if (!had.has('report') && !had.has('ready_paid')) {
      if (had.has('ready')) { if (paidRecently) await queueText({ kind: 'report', site: j.site, jobId, key: 'report', delayMs, by }); }
      else if (recent(readyAt)) await queueText({ kind: 'ready_paid', site: j.site, jobId, key: 'ready', delayMs, by });
    }
  }
}

/**
 * Booked, or moved to a new day or time (from lib/surveyor-alerts.js). A
 * booking is texted each time it is made (a rebooking after Unbook too); a
 * move replaces a move still waiting, and is left out while the booked text
 * is still waiting, since that one is worded when it goes, with the new time.
 * Never for a time already past.
 */
export async function textBookedOrMoved(jobId, { first, date, time }) {
  const j = await queryOne('select site from jobs where id = $1', [jobId]);
  if (!j || !DAMP.includes(j.site) || !date) return;
  const today = londonToday();
  const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  if (date < today || (date === today && time && String(time).slice(0, 5) <= nowHm)) return;
  const stamp = new Date().toISOString().slice(0, 16);
  const when = `${date} ${String(time || '').slice(0, 5)}`.trim();
  const waiting = (kinds) => query(`select id, kind from sms_outbox where job_id = $1 and kind = any($2::text[]) and status = 'waiting'`, [jobId, kinds]);
  if (first) {
    await query(`update sms_outbox set status = 'cancelled', error = 'Replaced by the new booking.' where job_id = $1 and kind in ('booked', 'moved') and status = 'waiting'`, [jobId]);
    await queueText({ kind: 'booked', site: j.site, jobId, key: `booked ${stamp}`, delayMs: STAFF_DELAY_MS, payload: { when } });
    return;
  }
  if ((await waiting(['booked'])).length) return;
  await query(`update sms_outbox set status = 'cancelled', error = 'It moved again (the newer move is texted instead).' where job_id = $1 and kind = 'moved' and status = 'waiting'`, [jobId]);
  /* Moved back (an Undo) to the time the last text gave them: nothing new to tell. */
  const told = await queryOne(`select payload->>'when' as w from sms_outbox where job_id = $1 and kind in ('booked', 'moved') and status = 'sent' order by sent_at desc limit 1`, [jobId]);
  if (told && told.w === when) return;
  await queueText({ kind: 'moved', site: j.site, jobId, key: `${when} ${stamp}`, delayMs: STAFF_DELAY_MS, payload: { when } });
}
