/**
 * Estate agents as a referral channel (the owner, 16 Nov 2026). Each agent has
 * their own booking link on each damp site (?ag=code, captured by visit.js), so
 * an enquiry through it is put down to them (leads.referred_by) without asking.
 * That is kept apart from the agent who lets us in (estate_agent_id), which
 * changes the texts. Growth lists each brand's agents with what they sent and
 * a month's statement to email them: first name and postcode district only,
 * never a street or money, written by the server, checked and sent by a person.
 * One brand at a time, since the damp sites never name each other.
 */
import { randomBytes } from 'node:crypto';
import { query, queryOne } from './db.js';
import { agentDetails, upsertAgent } from './estate-agents.js';
import { TODAY } from './today.js';
import { agentPageFor } from './agent-portal.js';

export const AGENT_SITES = { dampscan: 'https://dampscan.co.uk', 'ati-london': 'https://atidampsurvey.co.uk' };
/* No 0, o, 1, l or i: a code read out over the phone is typed right. */
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newCode = () => [...randomBytes(6)].map((b) => CHARS[b % CHARS.length]).join('');
export const linkFor = (site, code) => (AGENT_SITES[site] && code ? `${AGENT_SITES[site]}/?ag=${code}` : null);

/** The agent's code, made the first time it is wanted. */
export async function codeFor(id) {
  for (let i = 0; i < 5; i += 1) {
    try {
      const r = await queryOne('update estate_agents set ref_code = coalesce(ref_code, $2) where id = $1 returning ref_code', [id, newCode()]);
      return r ? r.ref_code : null;
    } catch (err) { if (err.code !== '23505') throw err; }
  }
  return null;
}

/** An enquiry that came through an agent's link is put down to them, with a line in its history. */
export async function referralFromLead(leadId) {
  const r = await queryOne(
    `update leads l set referred_by = a.id,
        sched_log = coalesce(l.sched_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Website', 'how', 'note',
          'note', 'Came through ' || a.name || coalesce(' (' || a.branch || ')', '') || '''s booking link.'))
       from estate_agents a
      where l.id = $1 and l.referred_by is null and coalesce(l.utm->>'ag', '') <> '' and a.ref_code = lower(l.utm->>'ag')
      returning a.id`, [leadId]);
  return r ? Number(r.id) : null;
}

/** Adds an agent from Growth, before they have sent anyone, with their code ready. */
export async function addAgent(body, site) {
  if (!AGENT_SITES[site]) return { error: 'Pick ATi or DampScan.' };
  const got = agentDetails(body);
  if (got.errors) return { error: Object.values(got.errors)[0] };
  if (!got.agent) return { error: 'Type the agent\'s name.' };
  const id = await upsertAgent(got.agent);
  await query('update estate_agents set site = coalesce(site, $2) where id = $1', [id, site]);
  return { id, code: await codeFor(id) };
}

const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'Your buyer';
const district = (pc) => { const p = String(pc || '').trim().toUpperCase(); return p.includes(' ') ? p.split(' ')[0] : p.length > 4 ? p.slice(0, -3) : p; };

/**
 * One brand's agents: everyone with a survey or a referral there in the last
 * 13 months, or added for it. Each with its link, counts over the last 12
 * months and the work behind a statement (first name and district only).
 */
export async function agentsView(site) {
  if (!AGENT_SITES[site]) return { error: 'Pick ATi or DampScan.' };
  const work = await query(
    `select coalesce(l.referred_by, j.estate_agent_id) as agent, j.id as job, l.id as lead,
            coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_postcode, l.postcode) as postcode,
            (l.referred_by is not null) as via_link, coalesce(j.job_date, (l.created_at at time zone 'Europe/London')::date)::text as day,
            j.date_set, j.status, (j.survey_sent_at is not null or j.report_ready_at is not null) as reported, j.paid_at is not null as paid,
            coalesce(j.survey_price_pence, 0)::int as price, (j.job_date <= ${TODAY}) as done
       from leads l full join jobs j on j.lead_id = l.id
      where coalesce(j.site, l.site) = $1 and coalesce(l.referred_by, j.estate_agent_id) is not null
        and (j.id is not null or (l.stage = 'complete' and coalesce(l.closed_reason, '') not like 'Duplicate%'))
        and coalesce(j.status, 'open') not in ('cancelled', 'declined')
        and coalesce(j.job_date, (l.created_at at time zone 'Europe/London')::date) >= ${TODAY} - 400`, [site]);
  const ids = [...new Set(work.map((w) => Number(w.agent)))];
  const agents = await query(
    `select id, name, branch, phone, email, ref_code from estate_agents
      where id = any($1::bigint[]) or (site = $2 and created_at >= now() - interval '400 days') order by name`, [ids, site]);
  const out = [];
  for (const a of agents) {
    const mine = work.filter((w) => Number(w.agent) === Number(a.id));
    const year = mine.filter((w) => w.day >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
    const code = a.ref_code || await codeFor(a.id);
    /* An agent first added on Scheduling belongs to the brand whose surveys they have. */
    await query('update estate_agents set site = coalesce(site, $2) where id = $1', [a.id, site]);
    out.push({
      id: Number(a.id), name: a.name, branch: a.branch, email: a.email, phone: a.phone, link: linkFor(site, code),
      page: await agentPageFor(Number(a.id)).catch(() => null),
      year: { sent: year.filter((w) => w.via_link).length, surveys: year.filter((w) => w.job && w.date_set).length, paid: year.filter((w) => w.paid).reduce((t, w) => t + w.price, 0) },
      work: mine.map((w) => ({
        first: first(w.name), district: district(w.postcode), day: w.day, viaLink: w.via_link,
        stage: !w.job ? 'enquired' : w.reported ? 'reported' : w.date_set && w.done ? 'surveyed' : w.date_set ? 'booked' : 'arranging'
      })).sort((x, y) => (x.day < y.day ? -1 : 1))
    });
  }
  out.sort((x, y) => y.year.surveys + y.year.sent - (x.year.surveys + x.year.sent) || x.name.localeCompare(y.name));
  return { site, agents: out };
}
