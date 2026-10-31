/**
 * Alert texts to the owners (Scott and Tom) through Twilio, for the two
 * alerts that must never be missed: a new website enquiry and a time picked
 * online. ntfy and the staff app still go too; this is the one that always
 * arrives, with no app and no shared daily limit.
 *
 * Off until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set and
 * ALERT_SMS_TO lists the owners' mobiles (comma separated). Separate from
 * SMS_AUTO, which is the customers' texts. The customer's number is in the
 * text so it can be tapped to call (the owner's choice); never a street.
 */
import { twilioSend } from './sms.js';
import { brandName, staffBase } from './alert-words.js';
import { mobileFor } from './messages.js';

export const ownerMobiles = () => String(process.env.ALERT_SMS_TO || '').split(',').map((n) => n.trim()).filter(Boolean);

/** Texts each owner. Never throws; returns how many went. */
export async function textOwners(body, sendImpl = twilioSend) {
  let sent = 0;
  for (const to of ownerMobiles()) {
    try { if ((await sendImpl({ to, body })).sent) sent++; } catch { /* the app alert still went */ }
  }
  return sent;
}

const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];
const first = (n) => String(n || 'Someone').trim().split(/\s+/)[0];
const call = (phone) => (mobileFor(phone) || String(phone || '').replace(/[^\d+]/g, '').length >= 10 ? ` Call ${String(phone).trim()}.` : ' No phone given.');
const open = (id) => ` ${staffBase()}/schedule.html#lead-${id}`;

export function enquiryText(site, id, lead) {
  const issues = (Array.isArray(lead.issues) ? lead.issues : []).filter((i) => i && i !== 'Not sure').map((i) => String(i).toLowerCase());
  return `New ${brandName(site)} enquiry: ${first(lead.first_name)}, ${district(lead.postcode)}${issues.length ? ', ' + issues.join(', ') : ''}.${call(lead.phone)}${open(id)}`;
}

export function pickText(lead, when, surveyor) {
  return `${brandName(lead.site)}: ${first(lead.first_name)} (${district(lead.postcode)}) picked ${when} online for ${surveyor}. Confirm it on Scheduling.${call(lead.phone)}${open(lead.id)}`;
}
