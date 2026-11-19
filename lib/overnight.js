/**
 * The last 24 hours, for ATi and DampScan (the owner, 19 Nov 2026: one place to
 * look, the morning brief built from the same figures so the two never
 * disagree). What came in, what was paid, booked and reported, what was filed
 * from email, the texts that went, and whether every check passed: the hourly
 * run, the card check, the inbox sweep and email reading.
 *
 * Read by the top of What's next, the ChatGPT and Claude morning_brief tool
 * and Settings. Counts only; every figure is worked out from the database.
 */
import { query, queryOne } from './db.js';
import { lastBeat } from './heartbeat.js';
import { mailScanConfigured } from './mail-scan.js';

const DAMP = ['dampscan', 'ati-london'];
const HOUR = 3600000;
const pounds = (p) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const when = (at) => new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** One check's state: ok, warn (late or failing) or off (not set up), with its words. */
function check(name, ok, said, at = null) { return { name, state: ok === null ? 'off' : ok ? 'ok' : 'warn', said, at }; }

export async function overnight(sites = DAMP, now = new Date()) {
  const s = sites.filter((x) => DAMP.includes(x));
  const since = new Date(now.getTime() - 24 * HOUR);
  if (!s.length) return null;
  const [enq, paid, booked, reported, emails, texts] = await Promise.all([
    query(`select coalesce(source_path, '') as src, from_partial from leads where site = any($1::text[]) and stage = 'complete' and created_at > $2`, [s, since]),
    queryOne(`select count(*)::int as n, coalesce(sum(p.amount_pence), 0)::int as pence from job_payments p join jobs j on j.id = p.job_id
        where j.site = any($1::text[]) and p.label <> 'refund' and p.created_at > $2`, [s, since]),
    queryOne(`select count(*)::int as n from jobs where site = any($1::text[]) and booked_at > $2 and status <> 'cancelled'`, [s, since]),
    queryOne(`select count(*)::int as n from jobs where site = any($1::text[]) and greatest(survey_sent_at, report_ready_at) > $2`, [s, since]),
    queryOne(`select
        (select count(*) from mail_items where site = any($1::text[]) and created_at > $2)
      + (select count(*) from leads l, jsonb_array_elements(coalesce(l.sched_log, '[]'::jsonb)) e where l.site = any($1::text[]) and e->>'how' = 'email' and e->>'by' <> 'Inbox' and (e->>'at')::timestamptz > $2)
      + (select count(*) from jobs j, jsonb_array_elements(coalesce(j.sched_log, '[]'::jsonb)) e where j.site = any($1::text[]) and e->>'how' = 'email' and e->>'by' <> 'Inbox' and (e->>'at')::timestamptz > $2) as n`, [s, since]).catch(() => ({ n: 0 })),
    queryOne(`select count(*)::int as n from sms_outbox where site = any($1::text[]) and status in ('sent', 'delivered') and sent_at > $2`, [s, since]).catch(() => ({ n: 0 }))
  ]);
  const by = (src) => enq.filter((e) => e.src === src).length;
  const fromEmail = by('email'), byPhone = by('phone'), web = enq.length - fromEmail - byPhone;
  const lines = [
    { key: 'enquiries', n: enq.length, said: enq.length ? `${plural(enq.length, 'new enquiry', 'new enquiries')}: ${[web && `${web} website`, fromEmail && `${fromEmail} email`, byPhone && `${byPhone} phone`].filter(Boolean).join(', ')}` : 'No new enquiries' },
    { key: 'paid', n: paid.n, pence: paid.pence, said: paid.n ? `${pounds(paid.pence)} paid in (${plural(paid.n, 'payment')})` : 'No payments in' },
    { key: 'booked', n: booked.n, said: booked.n ? `${plural(booked.n, 'survey')} booked` : 'Nothing booked' },
    { key: 'reported', n: reported.n, said: reported.n ? `${plural(reported.n, 'report')} sent` : 'No reports sent' },
    { key: 'emails', n: Number(emails.n), said: Number(emails.n) ? `${plural(Number(emails.n), 'email')} filed on cards` : 'No emails filed' },
    { key: 'texts', n: texts.n, said: texts.n ? `${plural(texts.n, 'text')} to customers` : 'No texts sent' }
  ];
  /* Every check, so a quiet day reads as checked, not skipped. */
  const [hourly, runs] = await Promise.all([lastBeat('hourly').catch(() => null), query(`select name, at, ok, said from check_runs`).catch(() => [])]);
  const run = Object.fromEntries(runs.map((r) => [r.name, r]));
  const fresh = (at, hours) => Boolean(at) && now - new Date(at) < hours * HOUR;
  const card = run.card_check, sweep = run.inbox_sweep;
  const checks = [
    check('Hourly run', fresh(hourly, 3), hourly ? `Last ran ${when(hourly)}.` : 'Not seen yet.', hourly),
    card ? check('Card payments match Stripe', fresh(card.at, 3) ? card.ok : false, fresh(card.at, 3) ? card.said : `Last checked ${when(card.at)}: late.`, card.at)
      : check('Card payments match Stripe', null, 'Not run yet: it runs hourly once Stripe is connected.'),
    sweep ? check('Inbox sweep', fresh(sweep.at, 14) ? sweep.ok : false, fresh(sweep.at, 14) ? sweep.said : `Last ran ${when(sweep.at)}: late.`, sweep.at)
      : check('Inbox sweep', null, 'Not run yet.'),
    check('Email reading every hour', mailScanConfigured() ? true : null, mailScanConfigured() ? 'On.' : 'Off: the inbox sweep covers it twice a day.')
  ];
  return { since: since.toISOString(), lines, checks, allOk: checks.every((c) => c.state !== 'warn') };
}
