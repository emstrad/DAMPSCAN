/**
 * Website enquiries for the assistant: find one by the customer's words, and
 * close, reopen or delete it. Each change goes through the staff route
 * (lib/routes/admin/leads.js) so the scoping, manager check and audit rows
 * are the ones the Leads page gets.
 */
import { whereNow } from '../journey.js';
import { callRoute, read, write, fail } from './shared.js';
import { findLeads, resolveLead, REASONS } from '../lead-status.js';
import leads from '../routes/admin/leads.js';

export const ENQUIRY = {
  type: 'string',
  description: 'The enquiry, by the customer\'s name, email, phone and/or postcode as the person says it (e.g. "Sarah BR6"), or an enquiry id from find_enquiry or list_enquiries.'
};

async function find(scope, { text, status }) {
  if (String(text || '').trim().length < 2) return fail('Search for at least two characters.');
  const rows = await findLeads(scope, text, { status: status || 'all' });
  const enquiries = rows.map((l) => ({ id: Number(l.id), name: l.first_name, email: l.email, phone: l.phone, postcode: l.postcode,
    business: l.site, date: l.created_at, form: l.stage, status: l.status, closedReason: l.closed_reason }));
  /* Where each ATi or DampScan one is on Scheduling now (lib/journey.js). */
  for (const e of enquiries) { const w = await whereNow({ leadId: e.id }); if (w) e.scheduler = w; }
  return { status: 200, data: { ok: true, enquiries } };
}

/* Words to an id, then the staff route. Ambiguity comes back as candidates. */
const change = (op, prefer) => async (scope, args) => {
  const r = await resolveLead(scope, args.enquiry, { prefer });
  if (r.error) return { status: 400, data: { ok: false, error: r.error, ...(r.matches ? { matches: r.matches } : {}) } };
  return callRoute(leads, scope, { method: 'POST', url: '/api/admin/leads', body: { op, id: r.id, reason: args.reason } });
};

const destructive = (tool) => ({ ...tool, annotations: { ...tool.annotations, destructiveHint: true } });

export const LEAD_TOOLS = [
  read('find_enquiry', 'Find an enquiry', 'Website enquiries matching a name, email, phone or postcode, each with its id and status (open, converted, closed). Use it to get the lead_id for create_job when booking someone who came from a web enquiry.',
    { text: { type: 'string', description: 'What to look for.' }, status: { type: 'string', enum: ['open', 'closed', 'converted', 'all'] } }, find),
  write('close_enquiry', 'Close an enquiry', 'Closes a website enquiry that will not become a job, so it stops showing in call-backs, alerts and counts. It stays on the Leads page and can be reopened. Give a reason: ' + REASONS.join(', ') + ' (or the person\'s own words). If several match, describe them and ask which.',
    { enquiry: ENQUIRY, reason: { type: 'string', description: 'Why: ' + REASONS.join(', ') + ', or free text.' } }, ['enquiry'], change('close', 'open'), { idempotent: true }),
  write('reopen_enquiry', 'Reopen an enquiry', 'Reopens a closed website enquiry so it shows in call-backs again.',
    { enquiry: ENQUIRY }, ['enquiry'], change('reopen', 'closed'), { idempotent: true }),
  destructive(write('delete_enquiry', 'Delete an enquiry', 'Deletes a website enquiry for good (spam, test or duplicate). Managers only, and not one a job came from. Prefer close_enquiry unless the person asks to delete. Ask the person to confirm the delete explicitly first.',
    { enquiry: ENQUIRY }, ['enquiry'], change('delete', 'open')))
];
