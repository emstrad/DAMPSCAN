/**
 * Assistant tools for clients: finding one, starting one, and correcting
 * their details.
 *
 * There is no clients table, on purpose (see lib/routes/admin/clients.js): a
 * client is the customer on a job, filled in behind by the web enquiry it
 * came from. So a client here is found across jobs and enquiries, "creating"
 * one is starting their first job (the client card appears from it, exactly
 * as on the screen), and updating one changes the details on their job
 * through the same staff route save, with its validation and audit row.
 */
import { query } from '../db.js';
import { present } from '../quoted.js';
import quoted from '../routes/admin/quoted.js';
import jobs from '../routes/admin/jobs.js';
import clients from '../routes/admin/clients.js';
import { callRoute, read, write, fail, notFound, jobInScope, ID } from './shared.js';
import { searchTerms, haystack, scoreSql, likeParams, bestOnly } from '../find-words.js';
import { updateEnquiry } from './add-enquiry.js';

const isDamp = (site) => site === 'dampscan' || site === 'ati-london';

/** Clients in scope matching a name, phone, email or postcode, grouped by who they are. */
export async function findClient(scope, { text }) {
  const raw = String(text || '').trim().slice(0, 80);
  if (raw.length < 2) return fail('Search for at least two characters.');
  /* Forgiving, as on the phone: each word anywhere in the name, email, phone, postcode or address. */
  const terms = searchTerms(raw);
  if (!terms.length) return { status: 200, data: { ok: true, clients: [] } };
  const jobHay = haystack({ name: "concat_ws(' ', j.customer_name, l.first_name)", email: "concat_ws(' ', j.customer_email, l.email)",
    phone: "concat_ws(' ', j.customer_phone, l.phone)", postcode: 'coalesce(j.customer_postcode, l.postcode)', address: "concat_ws(' ', j.customer_address, l.address_line1, l.town)" });
  const leadHay = haystack({ name: 'l.first_name', email: 'l.email', phone: 'l.phone', postcode: 'l.postcode', address: "concat_ws(' ', l.address_line1, l.town)" });
  const found = await query(
    `select * from (
     select j.id as job_id, null::bigint as lead_id, j.site, j.status, j.job_date::text as job_date,
            coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_phone, l.phone) as phone,
            coalesce(j.customer_email, l.email) as email, coalesce(j.customer_postcode, l.postcode) as postcode, ${scoreSql(jobHay, terms, 2)} as score
       from jobs j left join leads l on l.id = j.lead_id
      where j.site = any($1::text[])
     union all
     select null, l.id, l.site, case when l.closed_at is null then 'enquiry' else 'closed' end, null, l.first_name, l.phone, l.email, l.postcode, ${scoreSql(leadHay, terms, 2)}
       from leads l
      where l.site = any($1::text[]) and l.stage = 'complete' and not exists (select 1 from jobs j where j.lead_id = l.id)) x
     where x.score > 0 order by x.score desc limit 120`, [scope.businesses, ...likeParams(terms)]);
  const rows = bestOnly(found).slice(0, 60);
  /* One person with three jobs is one client: grouped by email, else phone, else name and postcode. */
  const byKey = new Map();
  for (const r of rows) {
    const key = (r.email || '').toLowerCase() || (r.phone || '').replace(/\D/g, '') || `${(r.name || '').toLowerCase()}|${(r.postcode || '').replace(/\s/g, '').toUpperCase()}`;
    const c = byKey.get(key) || { name: r.name, phone: r.phone, email: r.email, postcode: r.postcode, jobs: [], enquiries: [] };
    if (r.job_id) c.jobs.push({ id: Number(r.job_id), site: r.site, status: r.status, date: r.job_date });
    else c.enquiries.push({ id: Number(r.lead_id), site: r.site, ...(r.status === 'closed' ? { closed: true } : {}) });
    byKey.set(key, c);
  }
  return { status: 200, data: { ok: true, clients: [...byKey.values()].slice(0, 25) } };
}

/** An existing client's details, from one of their jobs, for create_job. */
export async function clientFrom(scope, jobId) {
  const found = await jobInScope(scope, jobId);
  if (!found) return null;
  const j = found.job;
  const lead = j.lead_id ? (await query('select first_name, phone, email, postcode from leads where id = $1', [j.lead_id]))[0] : null;
  return {
    customer_name: j.customer_name || (lead && lead.first_name), postcode: j.customer_postcode || (lead && lead.postcode),
    phone: j.customer_phone || (lead && lead.phone), email: j.customer_email || (lead && lead.email)
  };
}

async function updateClient(scope, { id, address, ...rest }) {
  const found = await jobInScope(scope, id);
  /* No job yet: the same words may be an enquiry on Scheduling, corrected there. */
  if (!found) return typeof id === 'number' ? notFound() : updateEnquiry(scope, id, { address, ...rest });
  /* The full address goes through the client card's route, which every business shares. */
  if (address !== undefined) {
    const out = await callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id, address } });
    if (out.status >= 400 || (out.data && out.data.ok === false)) return out;
    if (Object.values(rest).every((v) => v === undefined)) return out;
  }
  return saveClient(scope, found, { id, ...rest });
}

async function saveClient(scope, found, { id, name, postcode: said, phone, email }) {
  const postcode = typeof said === 'string' ? said.toUpperCase().trim() : said;
  const j = found.job;
  if (isDamp(j.site)) {
    /* The damp save writes every field, so it is sent the job as it stands. */
    return callRoute(jobs, scope, { method: 'POST', url: '/api/admin/jobs', body: {
      id, site: j.site, surveyor: j.surveyor, surveyType: j.survey_type, surveyPricePence: Number(j.survey_price_pence), surveyorFeePence: Number(j.surveyor_fee_pence),
      remedialPence: Number(j.remedial_pence), status: j.status, leadId: j.lead_id, jobDate: j.job_date ? new Date(j.job_date).toLocaleDateString('en-CA') : null,
      jobTime: j.job_time ? String(j.job_time).slice(0, 5) : null, note: j.note,
      customerName: name ?? j.customer_name, customerPostcode: postcode ?? j.customer_postcode,
      ...(phone !== undefined ? { customerPhone: phone } : {}), ...(email !== undefined ? { customerEmail: email } : {}) } });
  }
  const p = await present(j, found.business);
  return callRoute(quoted, scope, { method: 'POST', url: '/api/admin/quoted', body: {
    op: 'save', id, site: p.site, customerName: name ?? p.customerName, customerPostcode: postcode ?? p.customerPostcode, note: p.note,
    invoiceNetPence: p.invoiceNetPence, status: p.status, jobDate: p.jobDate, jobTime: p.jobTime,
    ...(phone !== undefined ? { customerPhone: phone } : {}), ...(email !== undefined ? { customerEmail: email } : {}) } });
}

export const CLIENT_TOOLS = [
  read('find_client', 'Find a client', 'Finds clients by name, phone, email or postcode across jobs and enquiries, one entry per person with their job numbers and any enquiry not yet a job.',
    { text: { type: 'string' } }, findClient),
  write('update_client', 'Update a client', 'Corrects a client\'s name, full address (house number, street, town), postcode, phone or email on one of their jobs (id is the client\'s name and/or postcode). On ATi and DampScan cards a phone or email given here is used instead of the enquiry\'s.',
    { id: ID, name: { type: 'string' }, address: { type: 'string', description: 'Full address without the postcode, e.g. "12 High Street, West Malling".' }, postcode: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } }, ['id'], updateClient, { idempotent: true })
];
