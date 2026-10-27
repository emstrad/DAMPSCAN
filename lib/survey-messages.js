/**
 * The words a damp survey sends, ready for the staff member's own WhatsApp,
 * Messages or mail app (the same three links as lib/messages.js; nothing is
 * sent from here and no message provider is involved):
 *
 *   confirm   the booking, to the customer
 *   deposit   the 50% deposit that secures it, to the customer
 *   chase     a time for the survey, to the estate agent
 *   remedial  after the report, offering help with the work it recommends.
 *             Both damp brands are survey only, so this offers to explain the
 *             report and check contractors' quotes against it, never to quote.
 */
import { greeting, linksFor } from './messages.js';

/* The damp brands' names and numbers, as the websites show them (scripts/sites.js). */
export const DAMP_BRANDS = {
  dampscan: { name: 'DampScan', phoneLabel: '07386 225526' },
  'ati-london': { name: 'ATi Damp Survey', phoneLabel: '020 3355 4944' }
};
const pounds = (p) => `£${(Number(p || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The words for one message about a survey (toSurvey's shape), or null. */
export function surveyWords(kind, s) {
  const brand = DAMP_BRANDS[s.site];
  if (!brand) return null;
  const sign = `Thanks, ${brand.name}, ${brand.phoneLabel}`;
  const where = s.street || s.postcode || 'the property';
  if (kind === 'confirm') {
    const when = s.awaitingAgent
      ? `We are waiting on ${s.agent ? s.agent.name : 'the estate agent'} to confirm a time for access, and will let you know as soon as they do.`
      : `It is booked for ${longDate(s.date)}${s.time ? ` at ${s.time}` : ''}.`;
    const who = s.surveyor ? ` ${cap(s.surveyor)} will carry out the survey.` : '';
    return { subject: `Your damp survey with ${brand.name}`,
      text: `${greeting(s.name)} thank you for booking your ${s.surveyLabel || 'damp'} survey at ${where} with ${brand.name}. ${when}${who} The survey fee is ${pounds(s.pricePence)}.\n\nAny questions, just reply or give us a call.\n\n${sign}` };
  }
  if (kind === 'deposit') {
    return { subject: `${brand.name}: deposit for your survey`,
      text: `${greeting(s.name)} to secure your survey we take a deposit of ${pounds(s.depositPence)}, half the fee, with the balance of ${pounds(s.pricePence - s.depositPence)} to follow. Reply here and we will send the payment details, or call us to pay by card.\n\n${sign}` };
  }
  if (kind === 'chase') {
    if (!s.agent) return null;
    const first = String(s.agent.name || '').trim().split(/\s+/)[0];
    return { subject: `Damp survey at ${where}`,
      text: `Hi ${first || 'there'}, can you confirm a time for the damp survey at ${where}${s.name ? ` for ${s.name}` : ''}? Let us know what works and we will confirm with the customer.\n\n${sign}` };
  }
  if (kind === 'remedial') {
    return { subject: `${brand.name}: the work in your report`,
      text: `${greeting(s.name)} I hope the report made sense. If anything in it needs explaining, or you would like us to read the quotes you get for the work against it, just reply. There is no charge for that.\n\n${sign}` };
  }
  return null;
}

/** Words plus links, or null. The chase goes to the agent's phone and email. */
export function surveyMessage(kind, s) {
  const words = surveyWords(kind, s);
  if (!words) return null;
  const to = kind === 'chase' ? s.agent : s;
  return { kind, ...words, links: linksFor(words, to.phone, to.email) };
}

export const SURVEY_MESSAGE_KINDS = ['confirm', 'deposit', 'chase', 'remedial'];
