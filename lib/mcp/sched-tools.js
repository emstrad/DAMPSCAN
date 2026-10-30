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
import { write, fail, notFound, jobInScope, callRoute, ID, DATE, TIME } from './shared.js';
import scheduling from '../routes/admin/scheduling.js';

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
    return ok({ said: `Pencilled time for ${card.name} taken off.`, card: { kind: card.kind, id: card.id } });
  }
  const who = String(surveyor || '').toLowerCase();
  if (!date || !time || !SURVEYORS.includes(who)) return fail('Give the day, the time and who is going (Scott, Tom, Ben or Ronnie).');
  if (force !== true) {
    const clash = await clashFor(who, date, time, card.kind === 'job' ? card.id : null, card.postcode);
    if (clash) return fail(`${clash} Say so if it should be pencilled in anyway (force).`);
  }
  const { sharing, recent } = await setPencil(card.kind, card.id, { date, time, surveyor: who, by: scope.name || 'Staff', byHand: card.agent, forced: force === true });
  await audit(`pencilled ${card.name} in for ${date} ${time}`);
  return ok({ card: { kind: card.kind, id: card.id }, said: `${card.name} pencilled in for ${date} at ${time} with ${who[0].toUpperCase() + who.slice(1)}, held${card.agent ? '' : ' 48 hours'}. It shows grey on Today.`
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
  return ok({ said: out.duplicate ? `That email was already on ${card.name}'s card.` : `Email ${direction === 'out' ? 'to' : 'from'} ${card.name} filed on their Scheduling card.`, card: { kind: card.kind, id: card.id } });
}

const COLUMN = { new: 'New enquiry', contacted: 'Contacted', waiting: 'Waiting for time', cold: 'Gone cold' };
/* The same Scheduling route the staff use, so ChatGPT and the page always do the same thing. */
const sched = (scope, body) => callRoute(scheduling, scope, { method: 'POST', url: '/api/admin/scheduling', body });
/* Puts a card in a column of the To book board, as dragging it there would. */
async function moveOnBoard(scope, args) {
  const card = await cardFor(scope, args);
  if (card.error) return card.error;
  if (args.to === 'unbook' || args.to === 'not_going_ahead') {
    const out = await sched(scope, args.to === 'unbook' ? { op: 'unbook', kind: card.kind, id: card.id } : { op: 'close', kind: card.kind, id: card.id, reason: args.reason || 'Other' });
    if (out.status >= 400) return fail((out.data && out.data.error) || 'That did not save.');
    return ok({ said: args.to === 'unbook' ? `${card.name} is off the diary, back on Scheduling waiting for a time.` : `${card.name} closed: not going ahead (${args.reason || 'Other'}). Kept, never deleted.`, card: { kind: card.kind, id: card.id } });
  }
  if (!COLUMN[args.to]) return fail('Say which column: new, contacted, waiting or cold.');
  /* Through the route, so a cancelled survey moved back is brought back properly. */
  const moved = await sched(scope, { op: 'move', kind: card.kind, id: card.id, to: args.to });
  if (moved.status >= 400) return fail((moved.data && moved.data.error) || 'That did not save.');
  await record({ scope, business: card.site, entity: card.kind, entityId: card.id, action: 'sched_move', after: { said: `Moved to ${COLUMN[args.to]} on Scheduling`, group: 'other', customer: card.name } });
  return ok({ said: `${card.name} moved to ${COLUMN[args.to]} on the Scheduling board.`, card: { kind: card.kind, id: card.id } });
}

/** The estate agent on an open enquiry (set_estate_agent passes enquiry words here). */
export async function enquiryAgent(scope, a) {
  const card = await cardFor(scope, { enquiry: a.enquiry });
  if (card.error) return card.error;
  const out = await sched(scope, { op: 'agent', kind: card.kind, id: card.id, agent: a.agent_name ? { name: a.agent_name, branch: a.agent_branch, phone: a.agent_phone, email: a.agent_email } : null });
  if (out.status >= 400) return fail((out.data && out.data.error) || 'That did not save.');
  return ok({ said: a.agent_name ? `${a.agent_name} saved as the estate agent for ${card.name}; it goes onto the job when booked.` : `Estate agent taken off ${card.name}.`, card: { kind: card.kind, id: card.id } });
}

export const SCHED_TOOLS = [
  write('move_on_board', 'Move a card on the Scheduling board', 'Puts an ATi or DampScan customer in a column of the Scheduling To book board: new (New enquiry), contacted, waiting (Waiting for time) or cold (Gone cold: went quiet, to try again later); unbook takes a booked survey off the diary back to waiting; not_going_ahead closes them with a reason (an enquiry closes, a job is cancelled, never deleted); moving a cancelled survey to waiting brings it back. For a job with no date (id) or an open enquiry (enquiry words). Booking (create_job, move_job), pencil_in, set_awaiting_agent and close_enquiry move cards on their own; every answer says where the customer now is.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, to: { type: 'string', enum: ['new', 'contacted', 'waiting', 'cold', 'unbook', 'not_going_ahead'] }, reason: { type: 'string', description: 'For not_going_ahead: booked elsewhere, not interested, no answer, already sorted, spam or other.' } }, ['to'], moveOnBoard),
  write('log_email', 'File an email on the customer card', 'Files one email with an ATi or DampScan customer, in full, on their Scheduling card so the team can read it there: direction in (they wrote) or out (we wrote), the subject, the words and when it was sent. Use for every customer email found in an inbox sweep or pasted in. For a job (id) or an open enquiry (enquiry words). The same email is never filed twice.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, direction: { type: 'string', enum: ['in', 'out'] },
      subject: { type: 'string' }, body: { type: 'string', description: 'The email text, without signatures or the quoted older emails.' }, sent_at: { type: 'string', description: 'When it was sent, ISO date and time.' } }, ['direction'], logEmail),
  write('pencil_in', 'Pencil in a time', 'Holds a time offered to an ATi or DampScan customer for 48 hours (grey on Today and the week, not booked), for a job with no date yet (id) or an open enquiry (enquiry words). Checks the surveyor\'s own hours and booked surveys. remove true takes the hold off. When they say yes, book it with create_job or move_job.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an enquiry with no job yet.' }, date: DATE, time: TIME, surveyor: { type: 'string' },
      force: { type: 'boolean', description: 'Only after the person agrees to a time outside the hours or near another survey.' }, remove: { type: 'boolean' } }, [], pencilIn)
];
