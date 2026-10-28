/**
 * Estate agents who arrange damp surveys: kept once, found again by name and
 * branch, linked from each survey. A booking that names an agent already on
 * file reuses that row (and fills in a phone or email it lacked), so "Foxtons,
 * Bromley" typed twice is one agent with two jobs, not two agents.
 */
import { query, queryOne } from './db.js';
import { str } from './http.js';
import { TODAY } from './today.js';

const PHONE = /^[\d\s+()-]{7,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The agent's details from a request, checked, or { errors }. Null name means none. */
export function agentDetails(raw) {
  if (!raw || typeof raw !== 'object') return { agent: null };
  const name = (str(raw.name, 120) || '').trim();
  if (!name) return { agent: null };
  const phone = (str(raw.phone, 30) || '').trim() || null;
  const email = (str(raw.email, 160) || '').trim() || null;
  const errors = {};
  if (phone && !PHONE.test(phone)) errors.agentPhone = 'Enter the agent\'s phone number in digits.';
  if (email && !EMAIL.test(email)) errors.agentEmail = 'The agent\'s email address does not look right.';
  if (Object.keys(errors).length) return { errors };
  return { agent: { name, branch: (str(raw.branch, 120) || '').trim() || null, phone, email } };
}

/**
 * The agent the website form wrote into the notes ("Estate agent to be
 * contacted to arrange access: Foxtons, 020 1234 5678, a@b.com."), or null.
 */
export function agentFromNotes(notes) {
  const m = /Estate agent to be contacted to arrange access(?::\s*([^.]*(?:\.[a-z]{2,}[^.]*)*))?\./i.exec(String(notes || ''));
  if (!m) return null;
  const bits = String(m[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const email = bits.find((b) => EMAIL.test(b)) || null;
  const phone = bits.find((b) => b !== email && PHONE.test(b)) || null;
  const name = bits.find((b) => b !== email && b !== phone) || 'Estate agent (name not given)';
  return { name, branch: null, phone, email };
}

/** The id of this agent, adding them or filling in what the row lacked. */
export async function upsertAgent(a) {
  const row = await queryOne(
    `insert into estate_agents (name, branch, phone, email) values ($1, $2, $3, $4)
     on conflict (lower(name), lower(coalesce(branch, ''))) do update
       set phone = coalesce(excluded.phone, estate_agents.phone), email = coalesce(excluded.email, estate_agents.email)
     returning id`, [a.name, a.branch, a.phone, a.email]);
  return Number(row.id);
}

/**
 * The survey fields a job save may carry beyond the form's own: the estate
 * agent, the agent wait and a typed address. Each is written only when it was sent, so the
 * Jobs page form, which has neither, never clears them.
 */
export async function surveyFields(body) {
  const columns = [];
  const values = [];
  if (body.estateAgent !== undefined) {
    const got = agentDetails(body.estateAgent);
    if (got.errors) return { errors: got.errors };
    columns.push('estate_agent_id');
    values.push(got.agent ? await upsertAgent(got.agent) : null);
  }
  if (body.customerAddress !== undefined) { columns.push('customer_address'); values.push((str(body.customerAddress, 200) || '').trim() || null); }
  if (typeof body.awaitingAgent === 'boolean') { columns.push('awaiting_agent'); values.push(body.awaitingAgent); }
  return { columns, values };
}

/**
 * Every agent with a survey in these sites: jobs in all, jobs in the last
 * twelve months, the last survey date, and the surveys waiting on them now.
 */
export async function listAgents(sites) {
  const rows = await query(
    `select a.id, a.name, a.branch, a.phone, a.email,
            count(j.id)::int as jobs,
            count(j.id) filter (where j.job_date >= ${TODAY} - 365)::int as year_jobs,
            max(j.job_date)::text as last_job,
            coalesce(json_agg(json_build_object('id', j.id, 'site', j.site, 'name', coalesce(j.customer_name, l.first_name),
              'postcode', coalesce(j.customer_postcode, l.postcode), 'street', concat_ws(', ', l.address_line1, l.town), 'date', j.job_date::text))
              filter (where j.awaiting_agent and j.status = 'booked'), '[]') as waiting
       from estate_agents a
       join jobs j on j.estate_agent_id = a.id and j.site = any($1::text[]) and j.status <> 'cancelled'
       left join leads l on l.id = j.lead_id
      group by a.id
      order by count(j.id) filter (where j.awaiting_agent and j.status = 'booked') desc, year_jobs desc, a.name`, [sites]);
  return rows.map((r) => ({
    id: Number(r.id), name: r.name, branch: r.branch, phone: r.phone, email: r.email,
    jobs: r.jobs, yearJobs: r.year_jobs, lastJob: r.last_job,
    waiting: (r.waiting || []).map((w) => ({ ...w, id: Number(w.id), street: w.street || w.postcode || null }))
  }));
}
