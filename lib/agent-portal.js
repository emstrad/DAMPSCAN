/**
 * The estate agent's own page (the owner, 18 Nov 2026, ATi first): one private
 * link per agent (/a/<token>), no password, like the customer's page. Every
 * property they sent us or let us into, urgent first: a time to confirm for
 * access, then what is booked, visited, reported and done, with the buyer's
 * details, the money and the report. Agents see everything (the owner's
 * choice); the report opens for them on the same rule as for the buyer, once
 * paid in full. Quick book and the asks are in lib/agent-book.js. Never a text
 * to the agent: they read it here.
 */
import { randomBytes } from 'node:crypto';
import { query, queryOne } from './db.js';
import { brandOf, codeOf, moneyOf, firstName } from './portal-view.js';
import { paidPenceSql } from './money-sql.js';
import { REPORT_DEADLINE } from './surveys.js';
import { portalLinkFor } from './portal.js';
import { AGENT_SITES } from './agent-referrals.js';

const DAMP = ['dampscan', 'ati-london'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** The agent's page link, made the first time it is wanted (one per agent, kept until replaced). */
export async function agentPageFor(id, { fresh = false } = {}) {
  const a = await queryOne(`update estate_agents set portal_token = case when $2 or portal_token is null then $3 else portal_token end
      where id = $1 returning portal_token, site`, [id, fresh, randomBytes(24).toString('base64url')]);
  return a && AGENT_SITES[a.site] ? `${AGENT_SITES[a.site]}/a/${a.portal_token}` : null;
}

/** The agent behind a link, or null. A link only ever opens on its own brand's site. */
export async function agentByToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const a = await queryOne('select id, name, branch, phone, email, site, show_buyer_page from estate_agents where portal_token = $1', [token]);
  return a && DAMP.includes(a.site) ? a : null;
}

/* Every survey and open enquiry that is theirs: they let us in, or sent the buyer. */
const MINE = '(j.estate_agent_id = $1 or l.referred_by = $1 or l.estate_agent_id = $1)';

export async function agentRows(agentId, site) {
  const jobs = await query(
    `select j.id, j.status, j.job_date::text as day, j.job_time, j.date_set, j.awaiting_agent, j.customer_name, j.customer_phone, j.customer_email,
            j.customer_postcode, coalesce(j.customer_address, concat_ws(', ', l.address_line1, l.town)) as address, j.surveyor, r.label as survey_label,
            j.survey_price_pence, j.paid_at, j.deposit_paid_at, j.tick_paid_pence, j.tick_deposit_pence, ${paidPenceSql('j')} as paid_pence,
            j.survey_sent_at, j.report_ready_at, j.report_held, j.report_path, j.report2_path, j.on_way_at, j.agent_ask, j.created_at,
            (${REPORT_DEADLINE})::text as report_due, j.estate_agent_id = $1 as keys
       from jobs j left join leads l on l.id = j.lead_id left join job_rates r on r.key = j.survey_type
      where j.site = $2 and ${MINE} and (j.status not in ('cancelled', 'declined') or j.updated_at > now() - interval '30 days')
        and coalesce(j.job_date, j.created_at::date) > current_date - 400
      order by j.job_date nulls first, j.job_time`, [agentId, site]);
  const leads = await query(
    `select l.id, l.first_name, l.phone, l.email, l.postcode, concat_ws(', ', l.address_line1, l.town) as address, l.pencil_date::text as pencil_date,
            to_char(l.pencil_time, 'HH24:MI') as pencil_time, l.created_at, l.estate_agent_id = $1 as keys
       from leads l
      where l.site = $2 and (l.referred_by = $1 or l.estate_agent_id = $1) and l.stage = 'complete' and l.closed_at is null
        and l.created_at > now() - interval '60 days' and not exists (select 1 from jobs j where j.lead_id = l.id)
      order by l.created_at desc`, [agentId, site]);
  return { jobs, leads };
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/** Where one survey stands, in the agent's words, with what they can do about it. */
export function stageOf(j, now = today()) {
  if (['cancelled', 'declined'].includes(j.status)) return { key: 'cancelled', label: 'Not going ahead' };
  const m = moneyOf(j);
  const reported = (j.survey_sent_at || j.report_ready_at) && !j.report_held;
  if (reported) return m.paidInFull ? { key: 'done', label: 'Report ready', done: true } : { key: 'ready', label: 'Report ready, balance due' };
  if (!j.date_set || !j.day) return { key: 'arranging', label: 'Arranging a time' };
  if (j.awaiting_agent) return { key: 'confirm', label: 'Confirm access', needsYou: true };
  if (j.day < now || ['completed', 'paid'].includes(j.status)) return { key: 'visited', label: 'Visited, report due' };
  return { key: 'booked', label: j.day === now ? 'Survey today' : 'Booked' };
}

export async function agentView(a, now = today(), { opened = true } = {}) {
  const { jobs, leads } = await agentRows(Number(a.id), a.site);
  const surveys = [];
  for (const j of jobs) {
    const m = moneyOf(j), st = stageOf(j, now);
    surveys.push({
      id: Number(j.id), kind: 'job', stage: st, name: j.customer_name, first: firstName(j.customer_name), phone: j.customer_phone || null, email: j.customer_email || null,
      address: j.address || null, postcode: j.customer_postcode, date: j.date_set ? j.day : null, time: j.date_set ? hhmm(j.job_time) : null,
      surveyor: j.surveyor ? j.surveyor[0].toUpperCase() + j.surveyor.slice(1) : null, survey: j.survey_label || 'Damp survey', keys: Boolean(j.keys),
      money: { price: m.pricePence, paid: m.paidPence, due: m.balancePence, deposit: m.depositPaid },
      reportDue: st.key === 'visited' ? j.report_due : null, report: st.key === 'done' && Boolean(j.report_path), report2: st.key === 'done' && Boolean(j.report_path) && Boolean(j.report2_path),
      onWay: j.on_way_at && Date.now() - Date.parse(j.on_way_at) < 4 * 3600000 && Date.now() - Date.parse(j.on_way_at) > 120000,
      asked: j.agent_ask || null,
      /* The buyer's own page carries their payment and bank details: shown to the agent only when chosen
         for that agent (the owner, 27 Nov 2026: a landlord may pay while the agent only tracks). */
      page: !a.show_buyer_page || ['cancelled', 'done'].includes(st.key) ? null : await portalLinkFor(Number(j.id)).catch(() => null)
    });
  }
  for (const l of leads) {
    surveys.push({ id: Number(l.id), kind: 'lead', stage: l.pencil_date ? { key: 'requested', label: 'Time requested' } : { key: 'arranging', label: 'Arranging a time' },
      name: l.first_name, first: firstName(l.first_name), phone: l.phone || null, email: l.email || null, address: l.address || null, postcode: l.postcode,
      date: l.pencil_date, time: l.pencil_time, keys: Boolean(l.keys), money: null });
  }
  const ORDER = { confirm: 0, ready: 1, done: 2, visited: 3, booked: 4, requested: 5, arranging: 6, cancelled: 9 };
  surveys.sort((x, y) => ORDER[x.stage.key] - ORDER[y.stage.key] || String(x.date || '9').localeCompare(String(y.date || '9')));
  /* Finished: reported and paid over a fortnight ago, or cancelled, folds away. */
  const old = (s) => s.stage.key === 'cancelled' || (s.stage.key === 'done' && s.date && s.date < new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  await query(`update estate_agents set portal_seen_at = now(), portal_opens = portal_opens + ${opened ? 1 : 0} where id = $1`, [a.id]).catch(() => {});
  return {
    agent: { name: a.name, branch: a.branch }, brand: brandOf(a.site), code: codeOf(a.site), today: now,
    needsYou: surveys.filter((s) => s.stage.needsYou),
    current: surveys.filter((s) => !s.stage.needsYou && !old(s)),
    finished: surveys.filter(old)
  };
}

/** One of their surveys' rows, or null when it is not theirs. */
export async function agentJob(agentId, site, jobId) {
  return queryOne(`select j.*, j.job_date::text as day from jobs j left join leads l on l.id = j.lead_id
      where j.id = $3 and j.site = $2 and ${MINE}`, [agentId, site, Number(jobId) || 0]);
}
