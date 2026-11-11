/**
 * The customer's page and the company's own details, for ChatGPT (the
 * owners' plan, 11 Nov 2026):
 *
 *   customer_page   their private link, how often it was opened, and what
 *                   they did there (managers of that business)
 *   report_release  Report ready, Hold or let go (managers), through the
 *                   surveys route so texts and the page behave as on Reports
 *   company_details Damp Surveying Limited's details from Settings (owners).
 *                   Never passwords: none are kept.
 */
import surveys from '../routes/admin/surveys.js';
import { portalLinkFor } from '../portal.js';
import { eventsFor, openedSummary } from '../portal-events.js';
import { readCompany } from '../company-details.js';
import { read, write, fail, notFound, jobInScope, canManage, callRoute, ID } from './shared.js';

const isDamp = (site) => site === 'dampscan' || site === 'ati-london';
const ok = (data) => ({ status: 200, data: { ok: true, ...data } });

async function managed(scope, id) {
  const found = await jobInScope(scope, id);
  if (!found) return { error: notFound() };
  if (!isDamp(found.job.site)) return { error: fail('Customer pages are for ATi and DampScan surveys.') };
  if (!canManage(scope, found.job.site)) return { error: fail('Only the managers of that business can do that.') };
  return found;
}

async function page(scope, { id }) {
  const found = await managed(scope, id);
  if (found.error) return found.error;
  const j = found.job;
  return ok({ link: await portalLinkFor(Number(j.id)), opened: await openedSummary(Number(j.id)), activity: (await eventsFor(Number(j.id), 15)).map((e) => ({ at: e.at, what: e.what, device: e.device })),
    said: `${j.customer_name || 'Their'} page link is ready to send. Nothing is sent from here.` });
}

async function release(scope, { id, action }) {
  const found = await managed(scope, id);
  if (found.error) return found.error;
  const body = { op: 'report', id: Number(found.job.id), ...(action === 'ready' ? { ready: true } : action === 'hold' ? { hold: true } : action === 'let_go' ? { hold: false } : {}) };
  if (Object.keys(body).length < 3) return fail('Say ready, hold or let_go.');
  const out = await callRoute(surveys, scope, { method: 'POST', url: '/api/admin/surveys', body });
  if (out.status !== 200) return fail((out.data && out.data.error) || 'That did not save.');
  const words = { ready: 'Report marked ready: they get the text in 2 minutes and their page unlocks it once paid in full.', hold: 'Report on hold: locked on their page and no texts until let go.', let_go: 'Report let go: the ready text goes if it never went.' };
  return ok({ said: words[action] });
}

async function company(scope) {
  if (!scope.isAdmin) return fail('Company details are for the owners.');
  const { fields, updatedAt } = await readCompany();
  return ok({ company: Object.fromEntries(fields.filter((f) => f.value).map((f) => [f.label, f.value])), updatedAt,
    said: 'From Settings, Company details. Passwords are never kept here.' });
}

export const PAGE_TOOLS = [
  read('customer_page', 'Customer page link and activity', 'An ATi or DampScan customer\'s private survey page: the link to send them (by the person, never from here), how often they opened it, and what they did there (paid, asked to move, messaged, downloaded the report).', { id: ID }, page),
  write('report_release', 'Report ready, hold or let go', 'Marks a damp survey report ready (texts the customer in 2 minutes), puts it on hold (locked on their page, no texts), or lets a held one go. Read back who and which first and wait for a yes.',
    { id: ID, action: { type: 'string', enum: ['ready', 'hold', 'let_go'], description: 'ready, hold or let_go.' } }, ['id', 'action'], release),
  read('company_details', 'Company details', 'Damp Surveying Limited\'s own details from Settings: company number, registered office, directors, HMRC references, Government Gateway user ID, year end, filing dates, bank and insurance. Owners only. Passwords are never kept.', {}, company)
];
