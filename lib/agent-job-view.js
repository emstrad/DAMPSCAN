/**
 * How one survey reads on the estate agent's page (the owner, 27 Nov 2026: a
 * landlord paying and a tenant letting us in read as "Buyer" and "You have the
 * keys", with the landlord's balance on show). Per job, because one agent can
 * have surveys they collect the money on and others they do not:
 *   access:  agent (has the keys), tenant or vendor (with a name and number), or
 *            not set, when nothing is said about keys at all;
 *   role:    buyer, landlord, tenant or owner, the label on the card;
 *   hide money on the agent's page, for a customer who pays us directly.
 * Set by the assistant (create_job, set_estate_agent) and Quick book.
 */
import { query, queryOne } from './db.js';

export const ACCESS_WAYS = ['agent', 'tenant', 'vendor'];
export const ROLES = ['buyer', 'landlord', 'tenant', 'owner'];
const ROLE_WORD = { buyer: 'Buyer', landlord: 'Landlord', tenant: 'Tenant', owner: 'Owner' };

/** What the agent's card says about getting in, or nothing when it was never said. */
export function accessLine(j) {
  const who = [j.access_name, j.access_phone].filter(Boolean).join(', ');
  if (j.agent_access === 'agent') return 'You have the keys';
  if (j.agent_access === 'tenant') return `Access arranged with the tenant${who ? ` (${who})` : ''}`;
  if (j.agent_access === 'vendor') return `Access arranged with the seller${who ? ` (${who})` : ''}`;
  return null;
}
export const roleWord = (j) => ROLE_WORD[j.customer_role] || 'Buyer';
/* Whether the agent lets us in, for the customer's texts: what was said per survey, else an agent on the card (the old meaning). */
export const agentLetsIn = (r) => (r.agent_access ? r.agent_access === 'agent' : Boolean(r.estate_agent_id));

/**
 * Sets what was given, leaves the rest; a line in the customer's history says what changed.
 * access 'none' clears it. Returns { said } or { error }.
 */
export async function setAgentView(jobId, { access, accessName, accessPhone, role, hideMoney }, by = 'Staff') {
  const sets = [], vals = [jobId], said = [];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (access !== undefined && access !== null && access !== '') {
    if (access !== 'none' && !ACCESS_WAYS.includes(access)) return { error: `Access is one of ${ACCESS_WAYS.join(', ')} or none.` };
    put('agent_access', access === 'none' ? null : access);
    if (access === 'none' || access === 'agent') { put('access_name', null); put('access_phone', null); }
    said.push(access === 'none' ? 'access not set' : access === 'agent' ? 'the agent has the keys' : `access with the ${access === 'vendor' ? 'seller' : 'tenant'}`);
  }
  if (accessName !== undefined && access !== 'agent' && access !== 'none') { put('access_name', String(accessName || '').trim().slice(0, 80) || null); }
  if (accessPhone !== undefined && access !== 'agent' && access !== 'none') { put('access_phone', String(accessPhone || '').trim().slice(0, 30) || null); }
  if (role !== undefined && role !== null && role !== '') {
    if (!ROLES.includes(role)) return { error: `Role is one of ${ROLES.join(', ')}.` };
    put('customer_role', role); said.push(`shown as the ${role}`);
  }
  if (typeof hideMoney === 'boolean') { put('agent_hide_money', hideMoney); said.push(hideMoney ? 'money hidden from the agent' : 'money shown to the agent'); }
  if (!sets.length) return { said: null };
  const row = await queryOne(`update jobs set ${sets.join(', ')} where id = $1 returning id`, vals);
  if (!row) return { error: 'That survey was not found.' };
  const line = `Agent's page: ${said.join(', ') || 'access contact updated'}.`;
  await query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'by', $2::text, 'how', 'note', 'note', $3::text)) where id = $1`,
    [jobId, by, line]).catch(() => {});
  return { said: line };
}
