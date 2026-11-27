/**
 * The estate agent's own page, for the assistant (the owner, 27 Nov 2026): a
 * link the person sends to the agent themselves, never sent from here. One
 * page per agent (lib/agent-portal.js, /a/<token>, kept once on the agent
 * record set by set_estate_agent), showing every property that agent sent us
 * or lets us into, and nobody else's; the link for one property opens on its
 * card (#job-N), the quick book link opens Quick book (#book). The buyer's own
 * page (with their payment and bank details) is off on the agent's page unless
 * chosen for that agent, as when a landlord pays and the agent only tracks.
 * A new link replaces the old one, which stops working at once.
 */
import { query, queryOne } from '../db.js';
import { read, write, fail, notFound, jobInScope, canManage, ID } from './shared.js';
import { agentPageFor, agentRows, stageOf } from '../agent-portal.js';
import { codeFor, linkFor, AGENT_SITES } from '../agent-referrals.js';

const DAMP = ['dampscan', 'ati-london'];
const NOTHING_SENT = 'Nothing was sent: the person sends this link to the agent themselves.';

/* The agent on a damp job: the one who lets us in, else the one who sent the buyer. */
async function agentOfJob(scope, id) {
  const found = await jobInScope(scope, id);
  if (!found || !DAMP.includes(found.job.site)) return { error: notFound() };
  if (!canManage(scope, found.job.site)) return { error: fail('Agent links are for the managers of this business.') };
  const j = found.job;
  const ref = j.lead_id ? await queryOne('select referred_by from leads where id = $1', [j.lead_id]) : null;
  const agentId = Number(j.estate_agent_id || (ref && ref.referred_by) || 0);
  if (!agentId) return { error: fail(`${j.customer_name || 'This customer'} has no estate agent on the card. Add one with set_estate_agent first.`) };
  /* An agent made from a job card may have no brand yet: it takes the job's. */
  const a = await queryOne('update estate_agents set site = coalesce(site, $2) where id = $1 returning *', [agentId, j.site]);
  if (!a) return { error: fail('That agent is no longer on file.') };
  if (a.site !== j.site) return { error: fail(`${a.name} is set up for the other brand, so their page cannot show this survey.`) };
  return { agent: a, job: j };
}

/* An agent by name (and branch), within the brands this person manages; several is a question, not a guess. */
async function agentByName(scope, name, branch) {
  if (!String(name || '').trim()) return { error: fail('Say which agent (their name or company), or a customer of theirs.') };
  const sites = DAMP.filter((s) => scope.businesses.includes(s) && canManage(scope, s));
  if (!sites.length) return { error: fail('Agent links are for the managers of ATi or DampScan.') };
  const words = `%${String(name || '').trim().replace(/[%_\\]/g, '')}%`;
  const rows = await query(`select * from estate_agents where (name ilike $1 or branch ilike $1)
      and ($2::text is null or branch ilike '%' || $2 || '%') and (site = any($3::text[]) or site is null) order by name, branch limit 8`,
  [words, branch ? String(branch).trim() : null, sites]);
  if (!rows.length) return { error: fail(`No estate agent called "${name}" on file. Add them with set_estate_agent on one of their customers.`) };
  if (rows.length > 1) return { error: { status: 409, data: { ok: false, error: 'Several agents match: ask which one.', agents: rows.map((r) => ({ name: r.name, branch: r.branch, site: r.site })) } } };
  if (!rows[0].site) return { error: fail(`${rows[0].name} has no brand yet: ask for a customer of theirs and use that instead.`) };
  return { agent: rows[0] };
}

const who = (a) => ({ name: a.name, branch: a.branch || null, brand: a.site === 'dampscan' ? 'DampScan' : 'ATi Damp Survey' });
const seen = (a) => ({ opens: Number(a.portal_opens || 0), lastOpened: a.portal_seen_at || null });

async function covers(a, focusId) {
  const { jobs, leads } = await agentRows(Number(a.id), a.site);
  return [
    ...jobs.map((j) => ({ customer: j.customer_name, postcode: j.customer_postcode, stage: stageOf(j).label, visit: j.date_set ? `${j.day} ${String(j.job_time || '').slice(0, 5)}`.trim() : null, thisOne: Number(j.id) === focusId })),
    ...leads.map((l) => ({ customer: l.first_name, postcode: l.postcode, stage: l.pencil_date ? 'Time requested' : 'Arranging a time', visit: null, thisOne: false }))
  ];
}

async function portalLink(scope, { id }) {
  const found = await agentOfJob(scope, id);
  if (found.error) return found.error;
  const { agent: a, job: j } = found;
  const page = await agentPageFor(Number(a.id));
  if (!page) return fail('The agent\'s page could not be made.');
  const list = await covers(a, Number(j.id));
  return { status: 200, data: { ok: true, url: `${page}#job-${j.id}`, agent: who(a), property: { customer: j.customer_name, postcode: j.customer_postcode },
    covers: list, buyerPageShown: Boolean(a.show_buyer_page), ...seen(a),
    said: `${a.name}'s page, opening on ${j.customer_name}, ${j.customer_postcode}. It shows ${list.length} propert${list.length === 1 ? 'y' : 'ies'} of theirs and no one else's. ${NOTHING_SENT}` } };
}

async function quickBookLink(scope, { agent, branch, id }) {
  const found = id ? await agentOfJob(scope, id) : await agentByName(scope, agent, branch);
  if (found.error) return found.error;
  const a = found.agent;
  const page = await agentPageFor(Number(a.id));
  if (!page) return fail('The agent\'s page could not be made.');
  const code = await codeFor(Number(a.id));
  return { status: 200, data: { ok: true, url: `${page}#book`, agent: who(a), buyerLink: linkFor(a.site, code), ...seen(a),
    said: `${a.name}'s page, opening on Quick book: their details are already known, so the next property books in a minute and lands on Scheduling for them. buyerLink is for a buyer to book themselves, put down to the agent. ${NOTHING_SENT}` } };
}

async function portalSettings(scope, { id, agent, branch, share_buyer_page: share, new_link: fresh }) {
  const found = id ? await agentOfJob(scope, id) : await agentByName(scope, agent, branch);
  if (found.error) return found.error;
  let a = found.agent;
  if (typeof share === 'boolean') a = await queryOne('update estate_agents set show_buyer_page = $2 where id = $1 returning *', [a.id, share]);
  const page = await agentPageFor(Number(a.id), { fresh: fresh === true });
  return { status: 200, data: { ok: true, url: page, agent: who(a), buyerPageShown: Boolean(a.show_buyer_page), newLink: fresh === true,
    said: `${fresh === true ? 'A new link replaces the old one, which no longer opens. ' : ''}The buyer's own page (payments and bank details) is ${a.show_buyer_page ? 'shown' : 'not shown'} on ${a.name}'s page. ${NOTHING_SENT}` } };
}

const AGENT = { type: 'string', description: 'The agent\'s name or company, e.g. "CA Services".' };
const BRANCH = { type: 'string', description: 'The branch, when the agent has several.' };

export const AGENT_TOOLS = [
  read('agent_portal_link', 'Estate agent page link', `ATi and DampScan, managers: the estate agent's own private page link for one survey, by the customer's words. The agent on the card (set_estate_agent) gets one page that shows every property they sent us or let us into (status, visit time, report progress, never another agent's), and this link opens on the survey asked for. Made the first time it is wanted and kept. Returns url, agent (name, branch, brand), property, covers (each of their properties with its stage and visit, thisOne marking the one asked for), buyerPageShown, opens and lastOpened. ${NOTHING_SENT} Several customers matching is answered with the list to ask which.`,
    { id: ID }, portalLink),
  read('agent_quick_book_link', 'Estate agent quick book link', `ATi and DampScan, managers: a link for an estate agent to book their next property in a minute, by the agent's name (agent, optional branch) or a customer of theirs (id). It opens their own page on Quick book with their details already known; what they book lands on Scheduling as a normal survey for that agent. Also returns buyerLink, the agent's booking link for a buyer to book themselves on the website, put down to the agent. ${NOTHING_SENT} Several agents matching is answered with the list to ask which.`,
    { agent: AGENT, branch: BRANCH, id: ID }, quickBookLink),
  write('agent_portal_settings', 'Estate agent page settings', 'ATi and DampScan, managers: for one estate agent (by name, or a customer of theirs): share_buyer_page shows or hides the buyer\'s own page link on the agent\'s page (it carries the buyer\'s payment and bank details, so it is off unless chosen, e.g. on when the agent collects the money, off when a landlord pays); new_link replaces their page link so the old one stops working (if it was shared by mistake). Read back the agent and the change.',
    { agent: AGENT, branch: BRANCH, id: ID, share_buyer_page: { type: 'boolean' }, new_link: { type: 'boolean' } }, [], portalSettings)
];
