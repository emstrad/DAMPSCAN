/**
 * The Scheduling board from the assistant (lib/scheduling.js, lib/pencils.js).
 * pencil_in holds a time offered to a customer for 48 hours, grey on Today,
 * with the same checks as the board: the surveyor's own hours and their
 * booked surveys. A time also offered to someone else is allowed and said
 * out loud, because the first yes gets it.
 */
import { record } from '../audit.js';
import { customer } from '../alert-words.js';
import { clashFor, DAMP } from '../scheduling.js';
import { setPencil, clearPencil } from '../pencils.js';
import { SURVEYORS } from '../splits.js';
import { findLead } from './team-tools.js';
import { addEmail } from '../correspondence.js';
import { write, fail, notFound, jobInScope, ID, DATE, TIME } from './shared.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });

/* The card: a dateless job by its words, or an open enquiry by name and postcode. */
async function cardFor(scope, { id, enquiry }) {
  if (id != null) {
    const found = await jobInScope(scope, id);
    if (!found || !DAMP.includes(found.job.site)) return { error: notFound() };
    return { kind: 'job', id: Number(found.job.id), site: found.job.site, name: customer(found.job.customer_name, found.job.customer_postcode), postcode: found.job.customer_postcode, agent: Boolean(found.job.awaiting_agent) };
  }
  const leads = (await findLead(scope, enquiry)).filter((l) => DAMP.includes(l.site));
  if (leads.length !== 1) return { error: fail(leads.length ? `More than one enquiry matches: ${leads.map((l) => customer(l.first_name, l.postcode)).join('; ')}. Ask which.` : 'No ATi or DampScan job or enquiry matches. Give the name and/or postcode.') };
  return { kind: 'lead', id: Number(leads[0].id), site: leads[0].site, name: customer(leads[0].first_name, leads[0].postcode), postcode: leads[0].postcode, agent: false };
}

async function pencilIn(scope, { id, enquiry, date, time, surveyor, force, remove }) {
  const card = await cardFor(scope, { id, enquiry });
  if (card.error) return card.error;
  const audit = (said) => record({ scope, business: card.site, entity: card.kind, entityId: card.id, action: 'sched_pencil', after: { said, group: 'bookings', customer: card.name } });
  if (remove) {
    await clearPencil(card.kind, card.id);
    await audit(`took the pencilled time off ${card.name}`);
    return ok({ said: `Pencilled time for ${card.name} taken off.` });
  }
  const who = String(surveyor || '').toLowerCase();
  if (!date || !time || !SURVEYORS.includes(who)) return fail('Give the day, the time and who is going (Scott, Tom, Ben or Ronnie).');
  if (force !== true) {
    const clash = await clashFor(who, date, time, card.kind === 'job' ? card.id : null, card.postcode);
    if (clash) return fail(`${clash} Say so if it should be pencilled in anyway (force).`);
  }
  const { sharing, recent } = await setPencil(card.kind, card.id, { date, time, surveyor: who, by: scope.name || 'Staff', byHand: card.agent, forced: force === true });
  await audit(`pencilled ${card.name} in for ${date} ${time}`);
  return ok({ said: `${card.name} pencilled in for ${date} at ${time} with ${who[0].toUpperCase() + who.slice(1)}, held${card.agent ? '' : ' 48 hours'}. It shows grey on Today.`
    + (card.agent ? ' Waiting on the agent, so it is held until someone lets it go.' : '')
    + (sharing.length ? ` The same time is also offered to ${sharing.join(', ')}: whoever says yes first gets it.` : '')
    + (recent.length ? ` Note: ${recent.join('; ')}.` : '') });
}

/* An email filed whole on the customer's Scheduling card, so the pop-up shows it. */
async function logEmail(scope, { id, enquiry, direction, subject, body, sent_at: at }) {
  const card = await cardFor(scope, { id, enquiry });
  if (card.error) return card.error;
  if (!subject && !body) return fail('Give the email\'s subject and words.');
  const out = await addEmail(card.kind, card.id, { dir: direction === 'out' ? 'out' : 'in', subject, body, at, by: scope.name || 'ChatGPT' });
  if (out.error) return notFound();
  if (!out.duplicate) await record({ scope, business: card.site, entity: card.kind, entityId: card.id, action: 'sched_email', after: { said: `filed an email ${direction === 'out' ? 'to' : 'from'} ${card.name}`, group: 'other', customer: card.name } });
  return ok({ said: out.duplicate ? `That email was already on ${card.name}'s card.` : `Email ${direction === 'out' ? 'to' : 'from'} ${card.name} filed on their Scheduling card.` });
}

export const SCHED_TOOLS = [
  write('log_email', 'File an email on the customer card', 'Files one email with an ATi or DampScan customer, in full, on their Scheduling card so the team can read it there: direction in (they wrote) or out (we wrote), the subject, the words and when it was sent. Use for every customer email found in an inbox sweep or pasted in. For a job (id) or an open enquiry (enquiry words). The same email is never filed twice.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, direction: { type: 'string', enum: ['in', 'out'] },
      subject: { type: 'string' }, body: { type: 'string', description: 'The email text, without signatures or the quoted older emails.' }, sent_at: { type: 'string', description: 'When it was sent, ISO date and time.' } }, ['direction'], logEmail),
  write('pencil_in', 'Pencil in a time', 'Holds a time offered to an ATi or DampScan customer for 48 hours (grey on Today and the week, not booked), for a job with no date yet (id) or an open enquiry (enquiry words). Checks the surveyor\'s own hours and booked surveys. remove true takes the hold off. When they say yes, book it with create_job or move_job.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, date: DATE, time: TIME, surveyor: { type: 'string' },
      force: { type: 'boolean', description: 'Only after the person agrees to a time outside the hours or near another survey.' }, remove: { type: 'boolean' } }, [], pencilIn)
];
