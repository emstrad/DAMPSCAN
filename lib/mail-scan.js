/**
 * The hourly inbox scan for the Scheduling board. Reads the owners' Microsoft
 * 365 mailbox through Microsoft Graph (an app with read-only Mail.Read for
 * that one mailbox) and writes each email to or from a customer on the board
 * onto their card: "They emailed" or "Replied". A reply from us moves a new
 * enquiry to Contacted; an email from them only goes on the log, because
 * nobody has answered yet.
 *
 * Only the sender, recipients and subject are read, never the body, and only
 * the message id is kept (mail_seen) so nothing is logged twice. An email
 * matching more than one card (a shared address, an agent with two buyers)
 * is left for the ChatGPT inbox sweep, which can ask which one.
 *
 * Needs M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET and M365_MAILBOX
 * (or M365_USER); without them it does nothing.
 */
import { query } from './db.js';
import { logContact, DAMP } from './scheduling.js';

const LOOKBACK_HOURS = 26;
/* Out-of-office and bounce messages are not the customer talking. */
const AUTOMATIC = /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|undeliverable|delivery (status|has failed)|mail delivery)/i;

export function mailScanConfigured() {
  return Boolean(process.env.M365_TENANT_ID && process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET && (process.env.M365_MAILBOX || process.env.M365_USER));
}

async function token(fetchImpl) {
  const r = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(process.env.M365_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.M365_CLIENT_ID, client_secret: process.env.M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  if (!r.ok) throw new Error(`Microsoft sign-in failed (${r.status})`);
  return (await r.json()).access_token;
}

/* Every address on the board, to the cards it belongs to. */
async function cardsByAddress() {
  const rows = await query(`
    select 'lead' as kind, l.id, lower(l.email) as email from leads l
     where l.site = any($1::text[]) and l.stage = 'complete' and l.closed_at is null and l.email is not null
       and l.created_at >= now() - interval '60 days' and not exists (select 1 from jobs j where j.lead_id = l.id)
    union all
    select 'job', j.id, lower(coalesce(j.customer_email, l.email)) from jobs j left join leads l on l.id = j.lead_id
     where j.site = any($1::text[]) and j.status = 'booked' and (not j.date_set or j.awaiting_agent or j.job_time is null)
       and coalesce(j.customer_email, l.email) is not null`, [DAMP]);
  const map = new Map();
  for (const r of rows) map.set(r.email, [...(map.get(r.email) || []), { kind: r.kind, id: Number(r.id) }]);
  return map;
}

export async function scanMail({ fetchImpl = fetch, now = new Date() } = {}) {
  if (!mailScanConfigured()) return { skipped: 'not set up' };
  const mailbox = String(process.env.M365_MAILBOX || process.env.M365_USER).toLowerCase();
  const auth = { Authorization: `Bearer ${await token(fetchImpl)}` };
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3600000).toISOString();
  let url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime`
    + `&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime asc&$top=100`;
  const cards = await cardsByAddress();
  let logged = 0, pages = 0;
  while (url && pages < 5) {
    const r = await fetchImpl(url, { headers: auth });
    if (!r.ok) throw new Error(`Reading the mailbox failed (${r.status})`);
    const page = await r.json();
    for (const m of page.value || []) {
      const fresh = await query('insert into mail_seen (message_id) values ($1) on conflict do nothing returning message_id', [m.id]);
      if (!fresh.length) continue;
      const from = String(m.from?.emailAddress?.address || '').toLowerCase();
      const ours = from === mailbox;
      const to = [...(m.toRecipients || []), ...(m.ccRecipients || [])].map((x) => String(x.emailAddress?.address || '').toLowerCase());
      const hits = ours ? to.flatMap((a) => cards.get(a) || []) : (cards.get(from) || []);
      if (hits.length !== 1 || AUTOMATIC.test(String(m.subject || '').trim())) continue;
      const subject = String(m.subject || '(no subject)').slice(0, 120);
      await logContact(hits[0].kind, hits[0].id, { at: m.receivedDateTime || now.toISOString(), by: 'Inbox', how: 'email', note: `${ours ? 'Replied' : 'They emailed'}: ${subject}` }, { moveOn: ours });
      logged += 1;
    }
    url = page['@odata.nextLink'] || null;
    pages += 1;
  }
  await query("delete from mail_seen where seen_at < now() - interval '30 days'");
  return { logged };
}
