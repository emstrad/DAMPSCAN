/**
 * A new customer's email becomes their card by itself (the owner, 19 Nov 2026:
 * "I've got an email from Michael. His card can then be set up straight away
 * ... no one is left in emails"). Called by the hourly inbox scan
 * (lib/mail-scan.js) for an email to us from an address no card or survey has.
 *
 * Only a person writing about a property: never our own addresses, Surveymate,
 * a no-reply or company mailer, a newsletter, junk or deleted mail, an estate
 * agent already on file (their buyers are worked by hand), or an email with
 * nothing about damp, a survey or a home in it. What is left goes through the
 * same path as ChatGPT's add_enquiry (lib/mcp/add-enquiry.js): the same person
 * is merged, never a second card; the brand follows the postcode, then the
 * address it was sent to. The card starts at the email's own time, in New,
 * with one alert (first name and district only, never the subject, which can
 * carry a street).
 */
import { query } from './db.js';
import { addEnquiry } from './mcp/add-enquiry.js';
import { notify } from './notify.js';
import { brandName, customer, page } from './alert-words.js';
import { patchOf } from './patches.js';
import { normalisePostcode } from './validate.js';

const OURS = /(^|\.)(atidampsurvey\.co\.uk|dampscan\.co\.uk|vergeroofing\.com|coolright\.co\.uk)$|surveymate/i;
const MAILER = /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|postmaster|bounces?|news(letter)?s?|marketing|updates?|billing|invoices?|accounts?|support|team|hello|info)([+._-]|$)/i;
const COMPANIES = /(^|\.)(google|microsoft|outlook|office365|facebookmail|linkedin|stripe|revolut|tide|twilio|vercel|github|godaddy|amazon|apple|paypal|xero|hmrc|gov|companieshouse|rightmove|zoopla|onthemarket|checkatrade|mybuilder|bark|ntfy|openai|anthropic|neon|cron-job|mailchimp|hubspot|sendgrid)\./i;
const BULK = /unsubscribe|view (this|it) in (your|a) browser|manage (your )?preferences/i;
const ABOUT = /damp|mou?ld|condensation|survey|rising|timber|\brot\b|woodworm|leak|wet|moisture|stain|propert|house|\bflat\b|home|buying|purchase|mortgage|inspection|report|quote|price|cost|book|visit|availab/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const PHONE = /(?:\+44\s?\(?0?\)?\s?|\b0)\d(?:[\s-]?\d){8,9}\b/;
const WEEK = 7 * 86400000;
const SYSTEM = { name: 'Inbox', isAdmin: true, businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } };

/** Junk and deleted folders, so their mail never makes a card. Best effort. */
export async function skipFolders(graph) {
  const ids = await Promise.all(['junkemail', 'deleteditems'].map((f) => graph(`/mailFolders/${f}?$select=id`).then((x) => x.id).catch(() => null)));
  return new Set(ids.filter(Boolean));
}

/** Their name as they sent it, or from the address ("michael.brown@" is Michael Brown). */
export function nameOf(display, address) {
  const d = String(display || '').replace(/["']/g, '').trim();
  if (d && !d.includes('@')) return d.slice(0, 80);
  return String(address || '').split('@')[0].replace(/\d+/g, ' ').split(/[._-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ').trim().slice(0, 80);
}

/** Whether this reads as a person writing to us about a property. */
export function looksLikeCustomer(m, from, skip = new Set()) {
  const domain = from.split('@')[1] || '';
  if (!domain || OURS.test(domain) || COMPANIES.test(domain) || MAILER.test(from.split('@')[0])) return false;
  if (skip.has(m.parentFolderId) || m.inferenceClassification === 'other') return false;
  const text = `${m.subject || ''} ${m.bodyPreview || ''}`;
  if (BULK.test(text)) return false;
  return ABOUT.test(text) || POSTCODE.test(text);
}

/** The card for a new customer's email, or null when it is not one. */
export async function cardFromEmail(m, { from, to, skip, now = new Date() }) {
  if (!looksLikeCustomer(m, from, skip)) return null;
  /* The brain's first read goes back a month; a card only for the last week, so old, settled mail adds no one. */
  if (now - Date.parse(m.receivedDateTime || now) > WEEK) return null;
  if ((await query('select 1 from estate_agents where lower(email) = $1 limit 1', [from])).length) return null;
  const text = `${m.subject || ''}\n${m.bodyPreview || ''}`;
  const pc = text.match(POSTCODE);
  const postcode = pc ? normalisePostcode(pc[1] + pc[2]) || `${pc[1]} ${pc[2]}`.toUpperCase() : '';
  const phone = (text.match(PHONE) || [''])[0].replace(/[^\d+]/g, '');
  const sentTo = to.some((a) => a.endsWith('@dampscan.co.uk')) ? 'dampscan' : 'ati-london';
  const site = { london: 'ati-london', kent: 'dampscan' }[patchOf(postcode)] || sentTo;
  const name = nameOf(m.from?.emailAddress?.name, from) || 'Email enquiry';
  const said = `${String(m.subject || '').slice(0, 150)}: ${String(m.bodyPreview || '').replace(/\s+/g, ' ').slice(0, 450)}`;
  const out = await addEnquiry(SYSTEM, { site, name, postcode, phone, email: from, said, how: 'email', at: m.receivedDateTime, via: 'the inbox scan' });
  if (out.status !== 200 || !out.data.card) return null;
  const card = out.data.card;
  if (!out.data.existing) {
    await notify({ business: site, kind: 'enquiry', ref: card.id, tags: 'email', priority: 4, path: page('schedule.html', site, `#lead-${card.id}`),
      title: `New enquiry by email: ${brandName(site)}`,
      message: `${customer(name, postcode, ' in ')} emailed us. Now on Scheduling in New: reply to them.` });
  }
  return { ...card, made: !out.data.existing };
}
