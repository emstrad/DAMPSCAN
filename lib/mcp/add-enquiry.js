/**
 * New customers and their details from ChatGPT (the owners' choice, 10 Nov
 * 2026): the inbox sweep makes a Scheduling card for anyone new it finds, at
 * all costs, rather than failing for want of a surveyor or a postcode. A card
 * is an enquiry like a website one (lib/sched-create.js), so booking, holds
 * and history work the same; a surveyor is only needed once a time is booked.
 * The brand follows the postcode's patch when it is not given (London ATi,
 * Kent DampScan).
 */
import { record } from '../audit.js';
import { customer } from '../alert-words.js';
import { createCard } from '../sched-create.js';
import { patchOf } from '../patches.js';
import { resolveLead } from '../lead-status.js';
import { query } from '../db.js';
import { fail } from './shared.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const SITE = { london: 'ati-london', kent: 'dampscan' };

export async function addEnquiry(scope, a) {
  const site = a.site || SITE[patchOf(a.postcode)] || null;
  if (!site) return fail('Say which business: ATi (London) or DampScan (Kent). The postcode does not settle it.');
  const by = scope.name || 'ChatGPT';
  const made = await createCard(scope, { site, name: a.name, postcode: a.postcode, phone: a.phone, email: a.email, address: a.address,
    note: a.said, how: a.how === 'call' ? 'call' : 'email', force: a.someone_else === true }, by);
  if (made.error) return fail(made.error);
  if (made.same) {
    return ok({ existing: true, said: `${customer(made.same.name, made.same.postcode)} is already on Scheduling with that phone or email: use that card (log_email files the email on it). Say someone_else true only if it is a different person.`,
      card: { kind: made.same.kind, id: made.same.id } });
  }
  const name = customer(a.name, a.postcode);
  await record({ scope, business: site, entity: 'lead', entityId: made.id, action: 'sched_create', after: { said: `Added from ${a.how === 'call' ? 'a phone call' : 'an email'} by ChatGPT`, group: 'other', customer: name } });
  return ok({ said: `${name} added to Scheduling${a.how === 'call' ? ', in Contacted' : ', in New enquiry'}.${a.postcode ? '' : ' No postcode yet: ask for it so times can be offered.'}`, card: { kind: 'lead', id: made.id } });
}

/** An enquiry's own details, when it has no job yet (update_client falls back here). */
export async function updateEnquiry(scope, ref, { name, address, postcode, phone, email }) {
  const lead = await resolveLead(scope, ref);
  if (lead.error) return { status: lead.matches ? 409 : 404, data: { ok: false, ...lead } };
  const sets = []; const vals = [lead.id];
  const put = (col, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') { vals.push(String(v).trim()); sets.push(`${col} = $${vals.length}`); } };
  put('first_name', name); put('address_line1', address); put('postcode', postcode && String(postcode).toUpperCase());
  put('phone', phone); put('email', email && String(email).toLowerCase());
  if (!sets.length) return fail('Say what to change: name, address, postcode, phone or email.');
  const [row] = await query(`update leads set ${sets.join(', ')} where id = $1 and site = any($${vals.length + 1}::text[]) returning id, site, first_name, postcode`, [...vals, scope.businesses]);
  if (!row) return fail('No enquiry for that in the businesses you hold.');
  await record({ scope, business: row.site, entity: 'lead', entityId: row.id, action: 'lead_update', after: { said: 'Details corrected', group: 'other', customer: customer(row.first_name, row.postcode) } });
  return ok({ said: `${customer(row.first_name, row.postcode)}'s enquiry details updated.`, card: { kind: 'lead', id: Number(row.id) } });
}
