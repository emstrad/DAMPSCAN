/**
 * What an AI assistant can do in the staff area: read everything the signed
 * in person can see, and make the changes the staff screens make. This file
 * holds the reads and the payment ticks; jobs, quotes, and the rest of the
 * day's work are in job-tools.js, quote-tools.js and work-tools.js, and the
 * shared to-do list in todo-tools.js.
 *
 * Almost every read is the staff route the screens themselves use, called
 * in-process with the person's scope already resolved. That is deliberate:
 * the assistant then sees exactly what that person sees in the browser, with
 * the same business filtering and the same rule that money is only for whoever
 * manages a business, and there is no second copy of any query to drift.
 */
import { query, queryOne } from '../db.js';
import { callRoute, route, read, write, fail, notFound, jobInScope, trimJob, AREA, SITE, RANGE, ID } from './shared.js';
import { JOB_TOOLS } from './job-tools.js';
import { QUOTE_TOOLS } from './quote-tools.js';
import { WORK_TOOLS } from './work-tools.js';
import { CLIENT_TOOLS } from './client-tools.js';
import { TODO_TOOLS } from './todo-tools.js';
import { ROOF_TOOLS } from './roof-tools.js';
import { AC_TOOLS } from './ac-tools.js';
import { LEAD_TOOLS } from './lead-tools.js';
import { CATCHUP_TOOLS } from './catchup-tools.js';
import { PEOPLE_TOOLS } from './people-tools.js';
import { TEAM_TOOLS } from './team-tools.js';
import { SCHED_TOOLS } from './sched-tools.js';
import { BRIEF_TOOLS } from './brief-tools.js';
import { REPORT_TOOLS } from './report-tools.js';
import { OWNER_TOOLS } from './owner-tools.js';
import { DRAFT_TOOLS } from './draft-tools.js';
import { GUIDE_TOOLS } from './guide-tools.js';

export { callRoute };
import { present } from '../quoted.js';
import { actionsFor } from '../work.js';
import { requestedSites } from '../access.js';
import { londonToday } from '../pipeline.js';
import { eventsFor } from '../routes/admin/calendar.js';
import { forViewer } from '../profit.js';
import due from '../routes/admin/due.js';
import leads from '../routes/admin/leads.js';
import summary from '../routes/admin/summary.js';
import jobs from '../routes/admin/jobs.js';
import clients from '../routes/admin/clients.js';
import quoted from '../routes/admin/quoted.js';
import contracts from '../routes/admin/contracts.js';
import calendar from '../routes/admin/calendar.js';
import insights from '../routes/admin/insights.js';
import pricebook from '../routes/admin/pricebook.js';
import bank from '../routes/admin/bank.js';
import people from '../routes/admin/people.js';
import rates from '../routes/admin/rates.js';
import me from '../routes/admin/me.js';
import photos from '../routes/admin/photos.js';

async function getJob(scope, { id }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const { job, business } = found;
  if (business.payout_model !== 'damp') return { status: 200, data: { ok: true, job: trimJob(forViewer(await present(job, business), scope), scope) } };
  const lead = job.lead_id ? await queryOne('select first_name, email, phone, postcode, address_line1, town, issues, notes from leads where id = $1', [job.lead_id]) : null;
  const card = (await callRoute(clients, scope, { url: '/api/admin/clients?view=all&site=' + job.site })).data;
  return { status: 200, data: { ok: true, job: { ...job, awaitingAgent: Boolean(job.awaiting_agent), lead, card: card && card.clients ? card.clients.find((c) => c.id === Number(job.id)) || null : null } } };
}

async function search(scope, { text }) {
  const t = `%${String(text || '').trim().slice(0, 80)}%`;
  if (t.length < 4) return { status: 400, data: { ok: false, error: 'Search for at least two characters.' } };
  const [ls, js] = await Promise.all([
    query(`select id, site, created_at, stage, first_name, email, phone, postcode from leads
            where site = any($1::text[]) and (first_name ilike $2 or email ilike $2 or phone ilike $2 or postcode ilike $2 or replace(postcode, ' ', '') ilike replace($2, ' ', ''))
            order by created_at desc limit 25`, [scope.businesses, t]),
    query(`select id, site, status, job_date::text as job_date, customer_name, customer_postcode from jobs
            where site = any($1::text[]) and (customer_name ilike $2 or customer_postcode ilike $2 or customer_email ilike $2 or customer_phone ilike $2)
            order by created_at desc limit 25`, [scope.businesses, t])
  ]);
  return { status: 200, data: { ok: true, enquiries: ls, jobs: js } };
}

async function markDeposit(scope, { id, amount_pounds: pounds }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model === 'damp') return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, depositPaid: true } });
  if (!(Number(pounds) > 0)) return fail('For Verge and CoolRight jobs, give the deposit amount in pounds.');
  return callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: { op: 'payment', id, amountPence: Math.round(Number(pounds) * 100), label: 'deposit' } });
}

async function markPaid(scope, { id }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model === 'damp') return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, paid: true } });
  /* The quoted trades keep a payments ledger, so "paid in full" is a balance
     payment for whatever is still owed. Nothing owed is nothing to record. */
  const job = await present(found.job, found.business);
  const owed = job.money.outstandingPence;
  if (!(owed > 0)) return fail(`Job #${id} has nothing outstanding: ${job.money.receivedPence / 100} received of ${job.money.invoicePence / 100}.`);
  return callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: { op: 'payment', id, amountPence: owed, label: 'balance' } });
}

async function markReport(scope, { id }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model !== 'damp') return fail('Only ATi and DampScan surveys have a report to send.');
  return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, surveySent: true } });
}

/* Damp only: the survey date is agreed but the estate agent has not confirmed
   access, which keeps the card in Upcoming. A time set later clears it. */
async function setAwaitingAgent(scope, { id, awaiting = true }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model !== 'damp') return fail('Only ATi and DampScan surveys wait on an estate agent.');
  return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, awaitingAgent: awaiting !== false } });
}

/* The calendar's Today panel, word for word: today's visits in time order and
   the grouped "Action needed" list from lib/work.js. */
async function needsDoing(scope, { area, site } = {}) {
  const sites = requestedSites(scope, new URLSearchParams(Object.entries({ area, site }).filter(([, v]) => v)));
  const today = londonToday();
  const [work, visits] = await Promise.all([actionsFor(scope, sites, { today }), eventsFor(sites, today, today)]);
  const slim = (i) => ({ group: i.group, id: i.id, jobId: i.jobId, site: i.site, firstName: i.firstName, postcode: i.postcode, date: i.date, what: i.what, overdue: i.overdue,
    ...(i.owedPence != null ? { owedPence: i.owedPence } : {}), ...(i.message ? { messageKind: i.message.kind } : {}) });
  return { status: 200, data: { ok: true, today, todaysVisits: visits, total: work.total,
    actionNeeded: work.groups.map((g) => ({ group: g.key, label: g.label, count: g.count, items: g.items.map(slim) })),
    tip: 'Messages: get_message then mark_message_sent. Ticks: mark_deposit_paid, mark_paid_in_full, mark_report_sent. Dates: move_job. To-dos: complete_todo.' } };
}

export const TOOLS = [
  read('whoami', 'Who am I', 'The signed in person, whether they are an admin, and the businesses and levels they hold.', {}, (scope) => callRoute(me, scope, { url: '/api/admin/me' })),
  read('what_needs_doing', 'What needs doing', 'What is outstanding today, the same list as the Calendar\'s Today panel: today\'s visits and every action needed, grouped and counted (enquiries to call back, messages to send, jobs with no date, surveys awaiting the estate agent, reports to send, deposits and payments to collect, overdue invoices, quotes to chase, to-dos, services due, over budget). Money only for managers.', { area: AREA, site: SITE }, needsDoing),
  ...CATCHUP_TOOLS,
  read('due_list', 'Due list', 'The Due page in full: messages to send, enquiries with no job, visits this week, quotes out, services due, money owed, payouts to freeze.', { area: AREA, site: SITE }, route(due, '/api/admin/due', ['area', 'site'])),
  read('search', 'Search customers', 'Find enquiries and jobs by name, email, phone or postcode.', { text: { type: 'string', description: 'What to look for.' } }, search),
  read('list_enquiries', 'Enquiries', 'Website enquiries, complete and partly filled in, newest first, each with its status: open (no job yet), converted (a job came from it) or closed (closedReason, closedBy). status filters; leave out for all.', { range: RANGE, stage: { type: 'string', enum: ['complete', 'partial'] }, status: { type: 'string', enum: ['open', 'closed', 'converted', 'all'] }, area: AREA, site: SITE, limit: { type: 'integer', maximum: 200 }, offset: { type: 'integer' } }, route(leads, '/api/admin/leads', ['range', 'stage', 'status', 'area', 'site', 'limit', 'offset'])),
  read('website_stats', 'Website stats', 'Page views, sessions, calls, form opens, dropouts and bookings.', { range: RANGE, area: AREA, site: SITE }, route(summary, '/api/admin/summary', ['range', 'area', 'site'])),
  read('get_job', 'One job', 'Everything about one job: customer, dates, status, quote, costs, payments, messages, and for damp the client card.', { id: ID }, getJob),
  read('list_survey_jobs', 'Survey jobs', 'ATi and DampScan survey jobs with what each person earned.', { range: RANGE, site: SITE }, route(jobs, '/api/admin/jobs', ['range', 'site'])),
  read('list_client_cards', 'Client cards', 'ATi and DampScan client cards: contact details, deposit, paid in full, report sent and awaitingAgent (waiting on estate agent confirmation).', { view: { type: 'string', enum: ['upcoming', 'archive', 'all'] }, site: SITE }, route(clients, '/api/admin/clients', ['view', 'site'])),
  read('list_quoted_jobs', 'Verge and CoolRight jobs', 'Quoted, booked, finished and paid jobs, with quote, costs, payments and payouts.', { range: RANGE, area: AREA, site: SITE }, route(quoted, '/api/admin/quoted', ['range', 'area', 'site'])),
  read('calendar', 'Calendar', 'Booked and finished work and services due between two dates, at most 70 days apart.', { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' }, area: AREA }, route(calendar, '/api/admin/calendar', ['from', 'to', 'area'])),
  read('insights', 'Insights', 'Money this month and last, twelve months of enquiries and work, win rate, channels, postcode districts and the area pages to write next.', { area: AREA, site: SITE }, route(insights, '/api/admin/insights', ['area', 'site'])),
  read('service_contracts', 'Service contracts', 'Servicing and maintenance contracts and when each is due.', { site: SITE, due: { type: 'integer', description: 'Only those due within this many days.' } }, route(contracts, '/api/admin/contracts', ['site', 'due'])),
  read('price_book', 'Price book', 'The business price book and quote templates.', { site: SITE }, route(pricebook, '/api/admin/pricebook', ['site'])),
  read('job_photos', 'Job photos', 'The photos on a job: stage, notes and whether each is on the website.', { job: ID }, route(photos, '/api/admin/photos', ['job'])),
  read('bank', 'Bank', 'Bank statement lines and how they are matched. Admin only.', { books: { type: 'string', enum: ['damp', 'roofing', 'ac'] }, view: { type: 'string', enum: ['attention', 'in', 'out', 'all'] }, from: { type: 'string', description: 'YYYY-MM-DD' } }, route(bank, '/api/admin/bank', ['books', 'view', 'from'])),
  read('people', 'People', 'Staff and what each holds.', { site: SITE }, route(people, '/api/admin/people', ['site'])),
  read('survey_rates', 'Survey rates', 'The damp survey rate card and splits.', {}, (scope) => callRoute(rates, scope, { url: '/api/admin/rates' })),
  write('mark_deposit_paid', 'Mark deposit paid', 'Records a deposit as paid today. For ATi and DampScan it ticks the deposit on the client card; for Verge and CoolRight it adds a deposit payment of the amount given.', { id: ID, amount_pounds: { type: 'number', description: 'Verge and CoolRight only: the deposit received, in pounds.' } }, ['id'], markDeposit),
  write('mark_paid_in_full', 'Mark paid in full', 'Records a job as paid in full today. For ATi and DampScan it ticks paid in full; for Verge and CoolRight it adds a balance payment of whatever is still owed.', { id: ID }, ['id'], markPaid),
  write('set_awaiting_agent', 'Awaiting estate agent', 'Marks an ATi or DampScan survey as awaiting estate agent confirmation (awaiting true), or clears it (false). The card stays in Upcoming while it waits. Setting a time with move_job clears it too.',
    { id: ID, awaiting: { type: 'boolean', description: 'true to mark as waiting (default), false to clear.' } }, ['id'], setAwaitingAgent, { idempotent: true }),
  write('mark_report_sent', 'Mark report sent', 'Ticks report sent on an ATi or DampScan client card.', { id: ID }, ['id'], markReport),
  ...LEAD_TOOLS,
  ...CLIENT_TOOLS,
  ...JOB_TOOLS,
  ...QUOTE_TOOLS,
  ...WORK_TOOLS,
  ...TODO_TOOLS,
  ...ROOF_TOOLS,
  ...AC_TOOLS,
  ...TEAM_TOOLS,
  ...SCHED_TOOLS,
  ...BRIEF_TOOLS,
  ...REPORT_TOOLS,
  ...OWNER_TOOLS,
  ...DRAFT_TOOLS,
  ...GUIDE_TOOLS,
  ...PEOPLE_TOOLS
];
