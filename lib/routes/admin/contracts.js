/**
 * /api/admin/contracts
 *
 *   GET   ?site=&jobId=&due=      the service contracts in scope; due=30 keeps
 *                                 those due within that many days or overdue
 *   POST  {op, ...}
 *     save       {id?, site, jobId?, customerName, customerPostcode, installedOn, intervalMonths,
 *                 nextDueOn?, unitCount, refrigerantKg, note, status}
 *     contacted  {id, on?}        the customer was reminded
 *     uncontacted {id, on?}       the Undo on Today: puts the last reminder date back (none when on is empty)
 *     serviced   {id, on?}        the service was done; the due date rolls forward and any booked visit clears
 *     unserviced {id, state}      its Undo: puts back the last service, due date, booked visit and status
 *     remove     {id}
 *
 * A contract made from a job takes the job's customer, so the working screen
 * can start one in a click. The due date defaults to the install date plus
 * the interval, and servicing rolls it forward from the day of the service,
 * not from when it was due, because a service done late is still a service.
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, requestedSites } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { record } from '../../audit.js';
import { TODAY } from '../../today.js';

export const config = { runtime: 'nodejs' };

const STATUSES = ['active', 'lapsed', 'ended'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const N = (v) => Number(v) || 0;

export function present(r) {
  return {
    id: Number(r.id), site: r.business_slug, jobId: r.job_id == null ? null : Number(r.job_id),
    customerName: r.customer_name, customerPostcode: r.customer_postcode,
    installedOn: r.installed_on, intervalMonths: Number(r.interval_months), nextDueOn: r.next_due_on,
    unitCount: Number(r.unit_count), refrigerantKg: r.refrigerant_kg == null ? null : Number(r.refrigerant_kg),
    pricePence: r.price_pence == null ? null : Number(r.price_pence),
    status: r.status, lastContactedOn: r.last_contacted_on, lastServicedOn: r.last_serviced_on, note: r.note,
    daysUntilDue: r.days_until_due == null ? null : Number(r.days_until_due)
  };
}

const SELECT = `select c.*, c.installed_on::text as installed_on, c.next_due_on::text as next_due_on,
                       c.last_contacted_on::text as last_contacted_on, c.last_serviced_on::text as last_serviced_on,
                       c.booked_on::text as booked_on, c.booked_time::text as booked_time,
                       (c.next_due_on - ${TODAY}) as days_until_due
                  from service_contracts c`;

async function own(id, scope, res) {
  const row = Number.isInteger(id) && id > 0 ? await queryOne(`${SELECT} where c.id = $1`, [id]) : null;
  if (!row || !scope.businesses.includes(row.business_slug)) {
    json(res, 404, { ok: false, error: 'not_found' });
    return null;
  }
  return row;
}

async function list(req, res, scope) {
  const url = new URL(req.url, 'http://localhost');
  const sites = requestedSites(scope, url.searchParams);
  const jobId = Number(url.searchParams.get('jobId')) || null;
  const due = url.searchParams.get('due') == null ? null : Math.max(0, Number(url.searchParams.get('due')) || 0);
  const rows = await query(
    `${SELECT} where c.business_slug = any($1::text[])
        and ($2::bigint is null or c.job_id = $2)
        and ($3::int is null or (c.status = 'active' and c.next_due_on <= ${TODAY} + $3))
      order by c.next_due_on, c.id limit 300`,
    [sites, jobId, due]
  );
  json(res, 200, { ok: true, contracts: rows.map(present) });
}

async function save(res, body, scope) {
  const id = body.id == null ? null : Number(body.id);
  const before = id ? await own(id, scope, res) : null;
  if (id && !before) return;
  const site = before ? before.business_slug : normaliseSite(body.site);
  if (!site || !scope.businesses.includes(site)) { json(res, 403, { ok: false, error: 'forbidden' }); return; }

  const errors = {};
  const installed = str(body.installedOn, 10) || null;
  if (installed && !DATE.test(installed)) errors.installedOn = 'Enter the install date as YYYY-MM-DD.';
  const interval = body.intervalMonths == null || body.intervalMonths === '' ? 12 : Number(body.intervalMonths);
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) errors.intervalMonths = 'Months between services, 1 to 60.';
  const units = body.unitCount == null || body.unitCount === '' ? 1 : Number(body.unitCount);
  if (!Number.isInteger(units) || units < 1) errors.unitCount = 'How many indoor units.';
  const kg = body.refrigerantKg == null || body.refrigerantKg === '' ? null : Number(body.refrigerantKg);
  if (kg !== null && !(kg >= 0)) errors.refrigerantKg = 'Refrigerant charge in kg.';
  const price = body.pricePence == null || body.pricePence === '' ? null : Math.round(Number(body.pricePence));
  if (price !== null && !(price >= 0)) errors.pricePence = 'The price per visit, in pounds.';
  let nextDue = str(body.nextDueOn, 10) || null;
  if (nextDue && !DATE.test(nextDue)) errors.nextDueOn = 'Enter the due date as YYYY-MM-DD.';
  const status = STATUSES.includes(body.status) ? body.status : (before ? before.status : 'active');
  const jobId = body.jobId == null || body.jobId === '' ? (before ? before.job_id : null) : Number(body.jobId);
  const job = jobId ? await queryOne('select id, site, customer_name, customer_postcode, job_date::text as job_date from jobs where id = $1', [jobId]) : null;
  if (jobId && (!job || job.site !== site)) errors.jobId = 'That job is not on this business.';
  if (Object.keys(errors).length) { json(res, 400, { ok: false, errors }); return; }

  /* The customer comes from the job unless typed; the due date from the
     install plus the interval unless given. */
  const name = str(body.customerName, 120) || (job && job.customer_name) || (before && before.customer_name) || null;
  const postcode = str(body.customerPostcode, 12) || (job && job.customer_postcode) || (before && before.customer_postcode) || null;
  const installedOn = installed || (job && job.job_date) || (before && before.installed_on) || null;
  const params = [site, jobId, name, postcode, installedOn, interval, nextDue, units, kg, status, str(body.note, 2000) || null, price];
  const row = before
    ? await queryOne(
      `update service_contracts set job_id = $2, customer_name = $3, customer_postcode = $4, installed_on = $5::date, interval_months = $6,
              next_due_on = coalesce($7::date, next_due_on), unit_count = $8, refrigerant_kg = $9, status = $10, note = $11, price_pence = $12, updated_at = now()
        where id = $13 returning *`, [...params, id])
    : await queryOne(
      `insert into service_contracts (business_slug, job_id, customer_name, customer_postcode, installed_on, interval_months, next_due_on, unit_count, refrigerant_kg, status, note, price_pence)
       values ($1, $2, $3, $4, $5::date, $6::int, coalesce($7::date, coalesce($5::date, ${TODAY}) + ($6::int * interval '1 month')), $8, $9, $10, $11, $12) returning *`, params);
  const after = await queryOne(`${SELECT} where c.id = $1`, [row.id]);
  await record({ scope, business: site, entity: 'contract', entityId: row.id, action: before ? 'contract_update' : 'contract_create', before: before && present(before), after: present(after) });
  json(res, 200, { ok: true, contract: present(after) });
}

async function change(res, body, scope) {
  const before = await own(Number(body.id), scope, res);
  if (!before) return;
  const on = str(body.on, 10) || null;
  if (on && !DATE.test(on)) { json(res, 400, { ok: false, errors: { on: 'Enter the date as YYYY-MM-DD.' } }); return; }
  if (body.op === 'contacted') {
    await query(`update service_contracts set last_contacted_on = coalesce($2::date, ${TODAY}), updated_at = now() where id = $1`, [before.id, on]);
  } else if (body.op === 'uncontacted') {
    await query('update service_contracts set last_contacted_on = $2::date, updated_at = now() where id = $1', [before.id, on]);
  } else if (body.op === 'serviced') {
    await query(
      `update service_contracts set last_serviced_on = coalesce($2::date, ${TODAY}),
              next_due_on = coalesce($2::date, ${TODAY}) + (interval_months * interval '1 month'), status = 'active',
              booked_on = null, booked_time = null, updated_at = now()
        where id = $1`, [before.id, on]);
  } else if (body.op === 'unserviced') {
    /* Undo of Serviced: puts back exactly what the service changed. */
    const back = body.state || {};
    const day = (v) => (v == null || v === '' ? null : DATE.test(String(v).slice(0, 10)) ? String(v).slice(0, 10) : undefined);
    const time = back.bookedTime == null || back.bookedTime === '' ? null : /^\d{2}:\d{2}/.test(back.bookedTime) ? String(back.bookedTime).slice(0, 5) : undefined;
    const vals = [day(back.lastServicedOn), day(back.nextDueOn), day(back.bookedOn), time];
    if (vals.includes(undefined) || !STATUSES.includes(back.status)) { json(res, 400, { ok: false, error: 'bad_state' }); return; }
    await query(`update service_contracts set last_serviced_on = $2::date, next_due_on = coalesce($3::date, next_due_on), booked_on = $4::date,
        booked_time = $5::time, status = $6, updated_at = now() where id = $1`, [before.id, ...vals, back.status]);
  } else if (body.op === 'remove') {
    await query('delete from service_contracts where id = $1', [before.id]);
    await record({ scope, business: before.business_slug, entity: 'contract', entityId: before.id, action: 'contract_remove', before: present(before), after: null });
    json(res, 200, { ok: true, removed: Number(before.id) });
    return;
  } else {
    json(res, 400, { ok: false, error: 'unknown_op' });
    return;
  }
  const after = await queryOne(`${SELECT} where c.id = $1`, [before.id]);
  await record({ scope, business: before.business_slug, entity: 'contract', entityId: before.id, action: `contract_${body.op}`, before: present(before), after: present(after) });
  const undo = body.op === 'serviced' ? { op: 'unserviced', id: Number(before.id), state: { lastServicedOn: before.last_serviced_on ?? null,
    nextDueOn: before.next_due_on ?? null, bookedOn: before.booked_on ?? null, bookedTime: before.booked_time ?? null, status: before.status } } : null;
  json(res, 200, { ok: true, contract: present(after), undo });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  try {
    if (req.method === 'GET') return await list(req, res, scope);
    const body = await readJson(req);
    if (!body.op || body.op === 'save') return await save(res, body, scope);
    return await change(res, body, scope);
  } catch (err) {
    console.error('contracts request failed:', err.message);
    json(res, 500, { ok: false, error: 'contracts_failed' });
  }
}
