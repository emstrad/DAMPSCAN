/**
 * Settings, "Ready to switch on" (owners): what the texts, online payments,
 * bank feed, receipts and reviews still need, at a glance. Only whether each
 * thing is set, never its value: a key is never shown, not even in part.
 *
 * Each item is ok (done), todo (needed before it works) or warn (set, but
 * worth a look, such as test mode still on).
 */
import { query, queryOne } from './db.js';
import { revolutConfigured } from './bank/revolut.js';
import { vapidConfig } from './webpush.js';
import { lastBeat } from './heartbeat.js';

const has = (k) => Boolean(String(process.env[k] || '').trim());
const item = (label, state, note = null) => ({ label, state, note });

export async function readiness() {
  const live = process.env.SMS_AUTO === 'on';
  const texts = [
    item('Twilio account (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)', has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') ? 'ok' : 'todo'),
    item('Sender name for ATi (TWILIO_FROM_ATI)', has('TWILIO_FROM_ATI') ? 'ok' : 'todo'),
    item('Sender name for DampScan (TWILIO_FROM_DAMPSCAN)', has('TWILIO_FROM_DAMPSCAN') ? 'ok' : 'todo'),
    item('Your alert texts (ALERT_SMS_TO)', has('ALERT_SMS_TO') ? 'ok' : 'todo'),
    has('SMS_TEST_TO') ? item('Test number (SMS_TEST_TO)', 'warn', 'Every customer text goes to your test number. Remove it to go live.') : item('Test number (SMS_TEST_TO)', 'ok', 'Not set: texts go to customers.'),
    item('Customer texts (SMS_AUTO=on)', live ? 'ok' : 'todo', live ? null : 'Off: texts wait in the outbox on the Texts page.')
  ];
  const hook = await queryOne("select updated_at from integration_keys where name = 'revolut_webhook_secret'").catch(() => null);
  const payments = [
    item('Revolut merchant key (REVOLUT_MERCHANT_KEY)', has('REVOLUT_MERCHANT_KEY') ? 'ok' : 'todo'),
    item('Revolut tells us about payments (Connect Revolut payments, below)', hook ? 'ok' : 'todo'),
    process.env.REVOLUT_SANDBOX === 'on' ? item('Test mode (REVOLUT_SANDBOX)', 'warn', 'On: no real money is taken. Remove it to go live.') : item('Test mode (REVOLUT_SANDBOX)', 'ok', 'Off: real payments.'),
    process.env.PAY_ONLINE === 'off' ? item('Pay button (PAY_ONLINE)', 'warn', 'Hidden on customer pages.') : item('Pay button (PAY_ONLINE)', 'ok')
  ];
  const feeds = await query('select books, enabled, last_synced_at, last_error from bank_feeds').catch(() => []);
  const on = feeds.filter((f) => f.enabled);
  const lastSync = on.reduce((a, f) => (f.last_synced_at && (!a || f.last_synced_at > a) ? f.last_synced_at : a), null);
  const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > 3 * 3600000;
  const bank = [
    item('Revolut Business API keys', revolutConfigured() ? 'ok' : 'todo'),
    item('Bank feed switched on (Bank page)', on.length ? 'ok' : 'todo'),
    on.some((f) => f.last_error) ? item('Bank feed working', 'warn', 'Last try failed: see the Bank page.')
      : item('Bank feed working', on.length && !stale ? 'ok' : on.length ? 'warn' : 'todo', on.length && stale ? 'Not pulled in the last 3 hours: is the hourly run going?' : null)
  ];
  const co = Object.fromEntries((await query('select key, value from company_details').catch(() => [])).map((r) => [r.key, r.value]));
  const banks = await query("select slug, payment_details from businesses where slug in ('dampscan', 'ati-london')").catch(() => []);
  const company = [
    item('Company number (Company details)', co.company_number ? 'ok' : 'todo', 'Printed on receipts.'),
    item('Registered office (Company details)', co.registered_office ? 'ok' : 'todo', 'Printed on receipts.'),
    item('Bank details on customer pages (business details)', banks.length === 2 && banks.every((b) => b.payment_details) ? 'ok' : 'todo', 'For paying by bank transfer.'),
    item('Google review link for ATi (REVIEW_URL_ATI)', has('REVIEW_URL_ATI') ? 'ok' : 'todo'),
    item('Google review link for DampScan (REVIEW_URL_DAMPSCAN)', has('REVIEW_URL_DAMPSCAN') ? 'ok' : 'todo')
  ];
  const ago = (at, hours) => at && Date.now() - new Date(at).getTime() < hours * 3600000;
  const [hourly, morning, evening] = await Promise.all(['hourly', 'morning', 'evening'].map((n) => lastBeat(n).catch(() => null)));
  const when = (at) => (at ? 'Last ran ' + new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : 'Not seen yet.');
  const runs = [
    item('Hourly run (texts at 7, bank feed, money checks, reports due)', ago(hourly, 3) ? 'ok' : 'todo', ago(hourly, 3) ? when(hourly) : when(hourly) + ' It runs from the GitHub mirror with CRON_SECRET.'),
    item('Morning run (06:30)', ago(morning, 26) ? 'ok' : 'warn', when(morning)),
    item('Evening run (17:00)', ago(evening, 26) ? 'ok' : 'warn', when(evening))
  ];
  const app = [
    item('Phone alerts from the staff app (push keys)', vapidConfig() ? 'ok' : 'todo'),
    item('Links in texts and alerts point at the live site (STATUS_BASE)', has('STATUS_BASE') ? 'ok' : 'warn', has('STATUS_BASE') ? null : 'Not set: dampscan.co.uk is used.')
  ];
  const groups = [['Customer texts', texts], ['Online payments', payments], ['Bank transfers', bank], ['Receipts and reviews', company], ['Scheduled runs', runs], ['Alerts', app]]
    .map(([title, items]) => ({ title, items, done: items.filter((i) => i.state !== 'todo').length, of: items.length }));
  return { groups, left: groups.reduce((t, g) => t + g.items.filter((i) => i.state === 'todo').length, 0) };
}
