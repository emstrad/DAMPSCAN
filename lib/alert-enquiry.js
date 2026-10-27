/**
 * The new-enquiry alert, the one that most needs acting on from a lock screen.
 *
 * Says who (first name and district), what they need (the issues ticked on
 * the form) and gives two buttons: Call, a tel: link, and Open, the leads
 * page. The number only ever goes in the tel: link, never the visible text.
 * It does still travel to ntfy inside the action, so the topic must stay
 * private (a hard to guess name, or a token with NTFY_TOKEN).
 */
import { brandName, customer, staffBase, page } from './alert-words.js';

const words = (issues) => {
  const list = (Array.isArray(issues) ? issues : []).filter((i) => i && i !== 'Not sure').map((i) => String(i).toLowerCase());
  if (!list.length) return issues && issues.length ? 'is not sure what the problem is' : 'has sent an enquiry';
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `needs help with ${joined}`;
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* Digits and a leading plus only, so nothing odd ends up in the link. */
const telOf = (phone) => {
  const t = String(phone || '').replace(/[^\d+]/g, '');
  return /^\+?\d{7,15}$/.test(t) ? t : '';
};

/** The notify() call for a finished enquiry. `lead` is the stored row. */
export function enquiryAlert(site, id, lead) {
  /* A damp enquiry opens on the Scheduling board, where it is called and booked. */
  const path = site === 'dampscan' || site === 'ati-london' ? `/schedule.html#lead-${id}` : page('dashboard.html', site);
  const tel = telOf(lead.phone);
  const actions = [];
  if (tel) actions.push({ action: 'view', label: 'Call', url: `tel:${tel}` });
  actions.push({ action: 'view', label: 'Open', url: staffBase() + path });
  return {
    business: site, kind: 'enquiry', ref: id, tags: 'telephone_receiver', priority: 4, path, actions,
    title: `New enquiry: ${brandName(site)}`,
    message: `${cap(customer(lead.first_name, lead.postcode, ' in '))} ${words(lead.issues)}. ${tel ? 'Tap Call to ring them back.' : 'Open the leads to reply.'}`
  };
}
