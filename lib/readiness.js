/**
 * Settings, "Ready to switch on" (owners): what the texts, online payments,
 * bank feed, receipts and reviews still need, at a glance. Only whether each
 * thing is set, never its value: a key is never shown, not even in part.
 *
 * Each item is ok (done), todo (needed before it works) or warn (set, but
 * worth a look, such as test mode still on), and says where it is put right
 * (`go`): a place in the staff area, or Vercel or GitHub for the keys, so
 * every cross can be tapped through to its fix (the owner's ask, 14 Nov 2026).
 */
import { query, queryOne } from './db.js';
import { revolutConfigured } from './bank/revolut.js';
import { vapidConfig } from './webpush.js';
import { lastBeat } from './heartbeat.js';
import { feedKey } from './ads-conversions.js';
import { mailScanConfigured } from './mail-scan.js';

const has = (k) => Boolean(String(process.env[k] || '').trim());
const item = (label, state, note = null, go = null) => ({ label, state, note, go });
/* Where each thing is set. Keys live in Vercel (Settings, Environment Variables), never here. */
const VERCEL = 'https://vercel.com/dashboard';
const MIRROR = 'https://github.com/VERTISE-DEV/DAMPSCAN/actions';
const BIZ = '/staff/insights.html?area=damp#p-business';

export async function readiness() {
  const live = process.env.SMS_AUTO === 'on';
  const texts = [
    item('Twilio account (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)', has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') ? 'ok' : 'todo', null, VERCEL),
    item('Sender name for ATi (TWILIO_FROM_ATI)', has('TWILIO_FROM_ATI') ? 'ok' : 'todo', null, VERCEL),
    item('Sender name for DampScan (TWILIO_FROM_DAMPSCAN)', has('TWILIO_FROM_DAMPSCAN') ? 'ok' : 'todo', null, VERCEL),
    item('Your alert texts (ALERT_SMS_TO)', has('ALERT_SMS_TO') ? 'ok' : 'todo', null, VERCEL),
    has('SMS_TEST_TO') ? item('Test number (SMS_TEST_TO)', 'warn', 'Every customer text goes to your test number. Remove it to go live.', VERCEL) : item('Test number (SMS_TEST_TO)', 'ok', 'Not set: texts go to customers.'),
    item('Customer texts (SMS_AUTO=on)', live ? 'ok' : 'todo', live ? null : 'Off: texts wait in the outbox on the Texts page.', VERCEL)
  ];
  /* Card payments go through Stripe (lib/stripe-pay.js) since Revolut refused the company. */
  const hook = await queryOne("select updated_at from integration_keys where name = 'stripe_webhook_secret'").catch(() => null);
  const testKey = /^(sk|rk)_test_/.test(String(process.env.STRIPE_SECRET_KEY || '').trim());
  const key = has('STRIPE_SECRET_KEY');
  const wallet = await queryOne("select 1 from integration_keys where name = 'stripe_wallet_domains'").catch(() => null);
  const payments = [
    key ? (testKey ? item('Stripe key (STRIPE_SECRET_KEY)', 'warn', 'A test key: no real money is taken. Use the live key to go live.', VERCEL) : item('Stripe key (STRIPE_SECRET_KEY)', 'ok', 'Live.'))
      : item('Stripe key (STRIPE_SECRET_KEY)', 'todo', 'Add it in Vercel, then Redeploy.', VERCEL),
    item('Stripe tells us about payments', hook ? 'ok' : 'todo', hook ? null : key ? 'Tap Connect card payments.' : 'Once the key is in.', hook ? null : '#p-pay'),
    /* The Apple Pay or Google Pay button on the page itself: the public key, and both sites registered with Stripe. */
    has('STRIPE_PUBLISHABLE_KEY') && wallet ? item('Apple Pay and Google Pay on the page', 'ok')
      : item('Apple Pay and Google Pay on the page', 'todo', has('STRIPE_PUBLISHABLE_KEY') ? 'Tap Connect again under Card payments.' : 'Add STRIPE_PUBLISHABLE_KEY (pk_live_) in Vercel.', has('STRIPE_PUBLISHABLE_KEY') ? '#p-pay' : VERCEL),
    process.env.PAY_ONLINE === 'off' ? item('Pay button (PAY_ONLINE)', 'warn', 'Hidden on customer pages.', VERCEL) : item('Pay button on customer pages', 'ok')
  ];
  /* Transfers land in Tide, which has no feed, so they are ticked by hand; the Revolut feed only shows while it is set up. */
  const feeds = await query('select books, enabled, last_synced_at, last_error from bank_feeds').catch(() => []);
  const on = feeds.filter((f) => f.enabled);
  const lastSync = on.reduce((a, f) => (f.last_synced_at && (!a || f.last_synced_at > a) ? f.last_synced_at : a), null);
  const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > 3 * 3600000;
  const banks = await query("select slug, payment_details from businesses where slug in ('dampscan', 'ati-london')").catch(() => []);
  const payTo = (slug) => Boolean((banks.find((b) => b.slug === slug) || {}).payment_details);
  const bank = [
    item('Bank details on ATi customer pages', payTo('ati-london') ? 'ok' : 'todo', payTo('ati-london') ? null : 'Insights, Business details, Payment details.', payTo('ati-london') ? null : BIZ),
    item('Bank details on DampScan customer pages', payTo('dampscan') ? 'ok' : 'todo', payTo('dampscan') ? null : 'Insights, Business details, Payment details.', payTo('dampscan') ? null : BIZ),
    ...(revolutConfigured() || on.length ? [
      on.some((f) => f.last_error) ? item('Bank feed working', 'warn', 'The last pull from Revolut failed.')
        : item('Bank feed working', on.length && !stale ? 'ok' : 'warn', on.length && stale ? 'Not pulled in the last 3 hours: is the hourly run going?' : null)
    ] : [item('Transfers ticked by hand', 'ok', 'Tick Deposit or Paid in full on their card when Tide shows it.')])
  ];
  const co = Object.fromEntries((await query('select key, value from company_details').catch(() => [])).map((r) => [r.key, r.value]));
  const company = [
    item('Company number', co.company_number ? 'ok' : 'todo', 'Printed on receipts.', co.company_number ? null : '#p-co'),
    item('Google review link for ATi (REVIEW_URL_ATI)', has('REVIEW_URL_ATI') ? 'ok' : 'todo', null, has('REVIEW_URL_ATI') ? null : VERCEL),
    item('Google review link for DampScan (REVIEW_URL_DAMPSCAN)', has('REVIEW_URL_DAMPSCAN') ? 'ok' : 'todo', null, has('REVIEW_URL_DAMPSCAN') ? null : VERCEL)
  ];
  const checksRows = [];
  const ago = (at, hours) => at && Date.now() - new Date(at).getTime() < hours * 3600000;
  const [hourly, morning, evening, minute] = await Promise.all(['hourly', 'morning', 'evening', 'texts'].map((n) => lastBeat(n).catch(() => null)));
  const when = (at) => (at ? 'Last ran ' + new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : 'Not seen yet.');
  const runs = [
    item('Hourly run (morning texts, reminders, money checks, reports due)', ago(hourly, 3) ? 'ok' : 'todo', ago(hourly, 3) ? when(hourly) : hourly ? when(hourly) + ' Late: is the GitHub hourly run going?' : 'GitHub runs it but it has not reached the site: CRON_SECRET must be a repository secret in VERTISE-DEV/dampscan, the same as in Vercel.', ago(hourly, 3) ? null : MIRROR),
    /* Texts held two minutes for Undo go out on this every-minute call (cron-job.org), not only when a staff page happens to be open. */
    item('Texts sent every minute (cron-job.org: /api/cron/texts)', ago(minute, 0.25) ? 'ok' : 'todo', minute ? when(minute) : 'Add a cron-job.org job every minute: GET https://dampscan.co.uk/api/cron/texts with the header Authorization: Bearer followed by your CRON_SECRET.'),
    item('Morning run (06:30)', ago(morning, 26) ? 'ok' : 'warn', when(morning)),
    item('Evening run (17:00)', ago(evening, 26) ? 'ok' : 'warn', when(evening))
  ];
  const app = [
    item('Phone alerts from the staff app (push keys)', vapidConfig() ? 'ok' : 'todo', null, vapidConfig() ? null : VERCEL),
    item('Links in texts and alerts point at the live site (STATUS_BASE)', has('STATUS_BASE') ? 'ok' : 'warn', has('STATUS_BASE') ? null : 'Not set: dampscan.co.uk is used.')
  ];
  /* Google Ads learning from who paid (lib/ads-conversions.js): set up once, read daily by Google. */
  const read = await Promise.all(['ati-london', 'dampscan'].map((s) => lastBeat(`ads_feed_${s}`).catch(() => null)));
  const fresh = read.some((at) => ago(at, 72));
  const ads = [item('Google Ads reads who paid (Growth, Paid customers sent to Google Ads)', fresh ? 'ok' : 'todo',
    fresh ? null : feedKey('ati-london') ? 'Give Google Ads the address on Growth, once.' : 'Needs SESSION_SECRET in Vercel.', fresh ? null : feedKey('ati-london') ? '/staff/company.html#growth' : VERCEL)];
  /* The brain reading every email whole (lib/mail-brain.js) through the hourly run. */
  const lastMail = await queryOne('select max(created_at) as at from mail_items').catch(() => null);
  const mail = [item('Email reading (M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_MAILBOX)', mailScanConfigured() ? 'ok' : 'todo',
    mailScanConfigured() ? (lastMail && lastMail.at ? 'Last email read ' + new Date(lastMail.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : 'Set: the first read goes back a month.')
      : 'A Microsoft app with Mail.Read for the mailbox, so reports emailed and replies are picked up by themselves.', mailScanConfigured() ? null : VERCEL)];
  /* The hourly card check and the scheduled inbox sweep (lib/stripe-check.js, lib/mcp/sweep-tools.js). */
  const runsOf = Object.fromEntries((await query('select name, at, ok, said from check_runs').catch(() => [])).map((r) => [r.name, r]));
  const card = runsOf.card_check, sweep = runsOf.inbox_sweep;
  checksRows.push(
    item('Card payments checked against Stripe every hour', card && ago(card.at, 3) ? (card.ok ? 'ok' : 'warn') : 'todo', card ? `${card.said} ${when(card.at)}` : 'Runs with the hourly run once STRIPE_SECRET_KEY is in Vercel.', card ? null : VERCEL),
    item('Inbox sweep (Claude, 05:48 and 14:48)', sweep && ago(sweep.at, 14) ? (sweep.ok ? 'ok' : 'warn') : 'todo', sweep ? `${sweep.said} ${when(sweep.at)}` : 'Not reported yet: the scheduled task needs the Microsoft 365 and Ati connectors.'));
  const groups = [['Customer texts', texts], ['Online payments', payments], ['Bank transfers', bank], ['Receipts and reviews', company], ['Scheduled runs', runs], ['Alerts', app], ['Email reading', mail], ['Checks', checksRows], ['Google Ads', ads]]
    .map(([title, items]) => ({ title, items, done: items.filter((i) => i.state !== 'todo').length, of: items.length }));
  return { groups, left: groups.reduce((t, g) => t + g.items.filter((i) => i.state === 'todo').length, 0) };
}
