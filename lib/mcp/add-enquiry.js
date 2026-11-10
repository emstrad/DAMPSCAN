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
import { FILL } from '../same-person.js';
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
    /* The same person (email, phone, or name and postcode): merged into their card, never a second one.
       Any detail the card lacked is filled in and what they said goes in its history. */
    const { kind, id } = made.same;
    const entry = { at: new Date().toISOString(), by, how: a.how === 'call' ? 'call' : 'email', ...(a.how === 'call' ? {} : { dir: 'in' }),
      note: `${a.how === 'call' ? 'They rang again' : 'They emailed again'}${a.said ? ': ' + String(a.said).slice(0, 800) : '.'}` };
    if (kind === 'lead') {
      await query(`update leads set ${FILL} where id = $1`, [id, a.phone || null, a.email || null, a.postcode || null, a.address || null]);
    }
    await query(`update ${kind === 'lead' ? 'leads' : 'jobs'} set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`, [id, JSON.stringify([entry])]);
    return ok({ existing: true, merged: true, said: `${customer(made.same.name, made.same.postcode)} was already on Scheduling, so this is merged into their card (missing details filled in, what they said added to their history). Say someone_else true only if it is a different person.`,
      card: { kind, id } });
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
