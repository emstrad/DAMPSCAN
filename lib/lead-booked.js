/**
 * What happens after an ATi or DampScan enquiry becomes a booked job, however
 * it was booked (Scheduling, the job pop-up or ChatGPT), so every way carries
 * the same things across: the estate agent (saved, or written by the website
 * form), the price of the extras the customer chose online, the enquiry's
 * hold taken off, and anyone else holding that time bumped back with a to-do.
 */
import { query, queryOne } from './db.js';
import { upsertAgent, agentFromNotes } from './estate-agents.js';
import { clearPencil, bumpOthers } from './pencils.js';

export async function afterLeadBooked({ leadId, surveyor, date, time }) {
  const l = await queryOne('select first_name, estate_agent_id, notes, survey_choice from leads where id = $1', [leadId]);
  const job = await queryOne('select id from jobs where lead_id = $1 order by id desc limit 1', [leadId]);
  if (!l || !job) return [];
  const parsed = !l.estate_agent_id ? agentFromNotes(l.notes) : null;
  const agentId = l.estate_agent_id ? Number(l.estate_agent_id) : parsed ? await upsertAgent(parsed) : null;
  if (agentId) await query('update jobs set estate_agent_id = coalesce(estate_agent_id, $2) where id = $1', [job.id, agentId]);
  /* The rate card prices the survey alone; extras chosen online (or a check on its own) set the job's price. */
  const c = l.survey_choice;
  const extras = (c && c.addOns) || [];
  if (c && c.price && (extras.length || c.service === 'alone')) {
    const pounds = Number(c.price) + extras.reduce((t, x) => t + Number(x.price || 0), 0);
    await query('update jobs set survey_price_pence = $2 where id = $1', [job.id, Math.round(pounds * 100)]);
  }
  await clearPencil('lead', leadId);
  return surveyor && date && time ? bumpOthers({ kind: 'lead', id: leadId, surveyor, date, time, bookedName: l.first_name }) : [];
}
