/**
 * Assistant tools for a job's life: starting one, moving it along the board,
 * booking it, notes, costs, time, miles, the invoice and the customer links.
 *
 * Each one is the staff route's own change (lib/routes/admin/quoted.js for
 * Verge and CoolRight, clients.js and jobs.js for ATi and DampScan), run as
 * the person, so validation, the audit row and the owner's notification are
 * the screen's. Nothing here writes to the database itself.
 */
import { present } from '../quoted.js';
import { afterLeadBooked } from '../lead-booked.js';
import { forViewer } from '../profit.js';
import quoted from '../routes/admin/quoted.js';
import clients from '../routes/admin/clients.js';
import jobs from '../routes/admin/jobs.js';
import surveys from '../routes/admin/surveys.js';
import { clientFrom } from './client-tools.js';
import { callRoute, read, write, fail, notFound, jobInScope, trimJob, ID, DATE, TIME } from './shared.js';

const pence = (pounds) => (pounds === undefined || pounds === null || pounds === '' ? undefined : Math.round(Number(pounds) * 100));
const op = (scope, body) => callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body });
const STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled'];

/** A Verge or CoolRight job in scope, or the answer explaining why not. */
async function quotedJob(scope, id, what) {
  const found = await jobInScope(scope, id);
  if (!found) return { error: notFound() };
  if (found.business.payout_model === 'damp') return { error: fail(`${what} is for Verge Roofing and CoolRight jobs. ATi and DampScan surveys are changed on the Jobs and Clients pages.`) };
  return found;
}

async function createJob(scope, args) {
  /* An existing client's details fill in whatever was not said this time. */
  let a = args;
  if (args.client_job_id != null) {
    const client = await clientFrom(scope, args.client_job_id);
    if (!client) return notFound();
    a = { ...client, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== '')) };
  }
  if (!a.customer_name) return fail('Give the client\'s name, or client_job_id for an existing client.');
  const site = a.site;
  if (!scope.businesses.includes(site)) return fail('You do not hold that business.');
  if (site === 'dampscan' || site === 'ati-london') {
    const out = await callRoute(jobs, scope, { method: 'POST', url: '/api/admin/jobs', body: {
      site, surveyType: a.survey_type, surveyor: a.surveyor, surveyPricePence: pence(a.price_pounds), customerName: a.customer_name,
      customerPostcode: a.postcode, customerPhone: a.phone, customerEmail: a.email, note: a.note, jobDate: a.job_date, jobTime: a.job_time,
      status: 'booked', leadId: a.lead_id, depositPaid: a.deposit_paid === true, force: a.force === true, ...agentBody(a) } });
    /* The same carry-over as booking on Scheduling: agent, chosen extras, hold, anyone sharing the time. */
    if (a.lead_id && out && out.status < 400 && !(out.data && out.data.ok === false)) {
      await afterLeadBooked({ leadId: Number(a.lead_id), surveyor: a.surveyor, date: a.job_date, time: a.job_time }).catch((err) => console.warn('lead carry-over failed:', err.message));
    }
    return out;
  }
  return op(scope, {
    op: 'save', site, customerName: a.customer_name, customerPostcode: a.postcode, customerPhone: a.phone, customerEmail: a.email,
    note: a.note, status: a.status === 'booked' ? 'booked' : 'quoted', jobDate: a.job_date, jobTime: a.job_time,
    invoiceNetPence: pence(a.price_pounds), leadId: a.lead_id
  });
}

/* The estate agent, only when one was named, so a plain booking stays with the customer. */
function agentBody(a) {
  const out = {};
  if (a.agent_name) out.estateAgent = { name: a.agent_name, branch: a.agent_branch, phone: a.agent_phone, email: a.agent_email };
  if (typeof a.awaiting_agent === 'boolean') out.awaitingAgent = a.awaiting_agent;
  return out;
}

const surveyOp = (scope, body) => callRoute(surveys, scope, { method: 'POST', url: '/api/admin/surveys', body });

async function setAgent(scope, a) {
  /* Loaded on use: sched-tools sits in the same tool list, so a static import would loop. */
  if (a.id == null && a.enquiry) return (await import('./sched-tools.js')).enquiryAgent(scope, a);
  const body = agentBody(a);
  if (!Object.keys(body).length) return fail('Give the agent\'s name, or awaiting_agent.');
  return surveyOp(scope, { op: 'agent', id: a.id, ...body });
}

async function setRemedial(scope, { id, status, amount_pounds: pounds }) {
  return surveyOp(scope, { op: 'remedial', id, status, amountPence: pence(pounds) });
}

async function updateStatus(scope, { id, status, job_date: jobDate, job_time: jobTime }) {
  const found = await quotedJob(scope, id, 'Moving a job along the board');
  if (found.error) return found.error;
  if (!STATUSES.includes(status)) return fail(`A job can be moved to ${STATUSES.join(', ')}. Paid comes from recording the money.`);
  return op(scope, { op: 'status', id, status, jobDate, jobTime });
}

async function bookJob(scope, { id, date, time, force }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return fail('Give the date as YYYY-MM-DD.');
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model === 'damp') return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, jobDate: date, ...(time ? { jobTime: time } : {}), force: force === true } });
  return op(scope, { op: 'status', id, status: 'booked', jobDate: date, jobTime: time });
}

/** A new date or time for a job, leaving its status as it is. */
async function moveJob(scope, { id, date, time, force }) {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return fail('Give the date as YYYY-MM-DD.');
  if (time && !/^\d{2}:\d{2}$/.test(String(time))) return fail('Give the time as HH:MM.');
  if (!date && !time) return fail('Say the new date, time or both.');
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (found.business.payout_model === 'damp') return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, ...(date ? { jobDate: date } : {}), ...(time ? { jobTime: time } : {}), force: force === true } });
  const j = await present(found.job, found.business);
  return op(scope, { op: 'save', id, site: j.site, customerName: j.customerName, customerPostcode: j.customerPostcode, note: j.note,
    invoiceNetPence: j.invoiceNetPence, status: j.status, jobDate: date || j.jobDate, jobTime: time || j.jobTime });
}

async function addNote(scope, { id, text }) {
  const words = String(text || '').trim();
  if (!words) return fail('Say what the note is.');
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  /* Added under what is there, dated, never replacing it. */
  const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const note = [found.job.note, `${stamp}: ${words}`].filter(Boolean).join('\n').slice(-2000);
  if (found.business.payout_model === 'damp') return callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, note } });
  /* The save op writes every field it is sent, so it is sent the job as it
     stands with only the note changed. */
  const j = await present(found.job, found.business);
  return op(scope, { op: 'save', id, site: j.site, customerName: j.customerName, customerPostcode: j.customerPostcode, note,
    invoiceNetPence: j.invoiceNetPence, status: j.status, jobDate: j.jobDate, jobTime: j.jobTime });
}

async function addCost(scope, { id, label, amount_pounds: pounds }) {
  const found = await quotedJob(scope, id, 'A cost line');
  if (found.error) return found.error;
  if (!(Number(pounds) >= 0)) return fail('Give the cost in pounds.');
  return op(scope, { op: 'cost', id, label, amountPence: pence(pounds) });
}

async function logTime(scope, { id, action, hours, date }) {
  const found = await quotedJob(scope, id, 'Time on site');
  if (found.error) return found.error;
  if (action === 'clock_in') return op(scope, { op: 'clockin', id });
  if (action === 'clock_out') return op(scope, { op: 'clockout', id });
  if (action === 'hours') return op(scope, { op: 'hours', id, hours, onDate: date });
  return fail('Say clock_in, clock_out, or hours with how many.');
}

async function logMiles(scope, { id, miles, date }) {
  const found = await quotedJob(scope, id, 'Miles');
  if (found.error) return found.error;
  return op(scope, { op: 'miles', id, miles, onDate: date });
}

const linkOnly = (r, pick) => (r.status === 200 && r.data && r.data.job ? { status: 200, data: { ok: true, id: r.data.job.id, ...pick(r.data.job.quote) } } : r);

async function createInvoice(scope, { id, due_days: dueDays }) {
  const found = await quotedJob(scope, id, 'An invoice');
  if (found.error) return found.error;
  return linkOnly(await op(scope, { op: 'invoice', id, dueDays }), (q) => ({ invoice: q.invoice }));
}

async function quoteLink(scope, { id }) {
  const found = await quotedJob(scope, id, 'A quote link');
  if (found.error) return found.error;
  return linkOnly(await op(scope, { op: 'quotelink', id }), (q) => ({ quoteUrl: q.url, accepted: q.accepted }));
}

async function invoiceLink(scope, { id }) {
  const found = await quotedJob(scope, id, 'An invoice link');
  if (found.error) return found.error;
  const job = trimJob(forViewer(await present(found.job, found.business), scope), scope);
  if (!job.quote.invoice) return fail(`Job #${id} has no invoice yet. Create one first.`);
  return { status: 200, data: { ok: true, id, invoice: job.quote.invoice } };
}

export const JOB_TOOLS = [
  write('create_job', 'Start a job', 'Starts a new job, for an existing client (client_job_id) or a new one with details given inline. For Verge Roofing (roofing) and CoolRight (ac) it is a quote or a booked job with the customer details, and its price can be left out and built from quote lines. For ATi and DampScan it is a booked survey and needs survey_type and surveyor; price_pounds overrides the rate card price, and deposit_paid ticks the deposit.',
    { site: { type: 'string', enum: ['dampscan', 'ati-london', 'roofing', 'ac'] }, customer_name: { type: 'string' }, postcode: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
      note: { type: 'string' }, status: { type: 'string', enum: ['quoted', 'booked'] }, job_date: DATE, job_time: TIME, price_pounds: { type: 'number', description: 'Net of VAT. Optional.' },
      force: { type: 'boolean', description: 'Only after the person agrees to a time inside the drive to or from another survey.' }, lead_id: { type: 'integer', description: 'The web enquiry it came from, if any: check find_enquiry for the customer\'s name or postcode first and pass the open one\'s id, so the enquiry shows as converted.' }, client_job_id: { type: 'string', description: 'An existing client, by name and/or postcode (or a job number from find_client). Their details are used unless given here.' }, survey_type: { type: 'string', description: 'Damp only: the rate card survey type, by key or name.' }, surveyor: { type: 'string', description: 'Damp only: who surveys it (Scott, Tom, Ben or Ronnie).' },
      deposit_paid: { type: 'boolean', description: 'Damp only: tick the deposit as paid now.' }, agent_name: { type: 'string', description: 'Damp only, when booked through an estate agent: the agent\'s name.' }, agent_branch: { type: 'string' }, agent_phone: { type: 'string' }, agent_email: { type: 'string' },
      awaiting_agent: { type: 'boolean', description: 'Damp only: the agent has still to confirm the time.' } },
    ['site'], createJob),
  write('set_estate_agent', 'Set estate agent', 'ATi and DampScan only: records the estate agent a survey was booked through (kept once and reused by name and branch), and/or whether the survey is waiting on them to confirm a time. For an enquiry not booked yet, pass enquiry (name and/or postcode) instead of id: the agent goes onto the job when it is booked.',
    { id: ID, enquiry: { type: 'string', description: 'Name and/or postcode of an open enquiry with no job yet.' }, agent_name: { type: 'string', description: 'Damp only, when booked through an estate agent: the agent\'s name.' }, agent_branch: { type: 'string' }, agent_phone: { type: 'string' }, agent_email: { type: 'string' },
      awaiting_agent: { type: 'boolean', description: 'Damp only: the agent has still to confirm the time.' } }, [], setAgent, { idempotent: true }),
  write('set_remedial_status', 'Remedial work', 'ATi and DampScan only, after the report: none, quoting (with the amount quoted), won (the amount then counts in the payout) or declined.',
    { id: ID, status: { type: 'string', enum: ['none', 'quoting', 'won', 'declined'] }, amount_pounds: { type: 'number' } }, ['id', 'status'], setRemedial, { idempotent: true }),
  write('create_client', 'New client', 'Adds a new client. There is no separate client list: a client is the customer on a job, so this starts their first job (a quote for Verge and CoolRight, a booked survey card for ATi and DampScan) with their details. Use find_client first so nobody is added twice.',
    { site: { type: 'string', enum: ['dampscan', 'ati-london', 'roofing', 'ac'] }, customer_name: { type: 'string' }, postcode: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
      note: { type: 'string' }, survey_type: { type: 'string', description: 'Damp only.' }, surveyor: { type: 'string', description: 'Damp only.' } },
    ['site', 'customer_name'], (scope, a) => createJob(scope, { ...a, status: 'quoted' })),
  write('update_job_status', 'Move a job', 'Moves a Verge or CoolRight job to quoted, booked, completed, declined or cancelled, optionally with a new date and time.',
    { id: ID, status: { type: 'string', enum: STATUSES }, job_date: DATE, job_time: TIME }, ['id', 'status'], updateStatus, { idempotent: true }),
  write('book_job', 'Book a job', 'Books a job in for a date (and time): a Verge or CoolRight job moves to booked; an ATi or DampScan survey has its date changed.',
    { id: ID, date: DATE, time: TIME, force: { type: 'boolean', description: 'Only after the person agrees to a time inside the drive to or from another survey.' } }, ['id', 'date'], bookJob, { idempotent: true }),
  write('move_job', 'Move a job', 'Moves a job or survey to a new date and/or time without changing where it is in the pipeline. For an ATi or DampScan survey, setting a time also clears awaiting estate agent confirmation. Remind the person to let the customer know.',
    { id: ID, date: DATE, time: TIME, force: { type: 'boolean', description: 'Only after the person agrees to a time inside the drive to or from another survey.' } }, ['id'], moveJob, { idempotent: true }),
  write('add_note', 'Add a note', 'Adds a dated line to the job\'s notes, under whatever is there.', { id: ID, text: { type: 'string' } }, ['id', 'text'], addNote),
  write('add_cost', 'Add a cost', 'Adds a cost line (materials, skip, hire and so on) to a Verge or CoolRight job. A cost is deducted from the job\'s price for profit and payout; it never changes the price.', { id: ID, label: { type: 'string' }, amount_pounds: { type: 'number' } }, ['id', 'label', 'amount_pounds'], addCost),
  write('log_time', 'Log time', 'Clocks the signed in person in or out of a job, or records hours already worked (action hours, with hours and optionally date).',
    { id: ID, action: { type: 'string', enum: ['clock_in', 'clock_out', 'hours'] }, hours: { type: 'number' }, date: DATE }, ['id', 'action'], logTime),
  write('log_miles', 'Log miles', 'Records miles the signed in person drove for a job.', { id: ID, miles: { type: 'number' }, date: DATE }, ['id', 'miles'], logMiles),
  write('create_invoice', 'Create invoice', 'Issues the invoice for a booked or finished Verge or CoolRight job, taking the business\'s next invoice number, and returns its number and link. Issuing again only moves the due date.',
    { id: ID, due_days: { type: 'integer', description: 'Days to pay. Default 14.' } }, ['id'], createInvoice, { idempotent: true }),
  write('get_quote_link', 'Quote link', 'Returns the customer\'s link to their quote, making it if there is none yet (which counts as the quote going out, for the follow-ups).', { id: ID }, ['id'], quoteLink, { idempotent: true }),
  read('get_invoice_link', 'Invoice link', 'The invoice number, due date and the customer\'s link to it, once issued.', { id: ID }, invoiceLink)
];
