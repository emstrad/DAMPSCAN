/**
 * /api/admin/quoted
 *
 *   GET   ?site=&range=              the quoted-trade jobs in scope, worked out
 *   POST  {op, ...}                  one change, audited:
 *     save      {id?, site, customerName, ..., invoiceNetPence, status, finderPersonId}
 *     cost      {id, label, amountPence}         add a cost line
 *     uncost    {id, costId}                      remove one
 *     days      {id, personId, days, dayRatePence} set an owner's days
 *     payment   {id, amountPence, paidOn?, label?, note?}
 *     unpay     {id, paymentId}
 *     freeze    {id}                              write the payout, if paid in full
 *     unfreeze  {id, reason}                      admin only, and it says why
 *
 * This is the quoted-trade counterpart of jobs.js, which stays the damp survey
 * route untouched. A job here belongs to a business whose payout model is not
 * damp, and the business's own engine works it out. Nothing is stored that the
 * engine can derive, except the payout once it freezes.
 *
 * Freezing is the moment the figure stops moving. It needs the money to have
 * cleared, which is a computed fact from the payments list and not a box, and
 * it needs manage on the business or admin. A cost entered afterwards does not
 * claw anything back: it lands, the drift is reported, and an admin who wants
 * the stored figure changed unfreezes with a reason and freezes again.
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, sitesFor } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { record } from '../../audit.js';
import { TODAY, daysAgo } from '../../today.js';
import { payoutFor } from '../../payout/index.js';
import { businessFor, loadLines, engineInput, ledgerRows, paymentState, present, QUOTED_STATUSES } from '../../quoted.js';

export const config = { runtime: 'nodejs' };

const pence = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

const canManage = (scope, site) => scope.isAdmin || scope.levels[site] === 'manage';

function since(range) {
  if (range === 'today') return TODAY;
  if (range === '30d') return daysAgo(30);
  if (range === '90d') return daysAgo(90);
  if (range === 'all') return "'1970-01-01'::date";
  return daysAgo(7);
}

/** A job in scope, with its business, or a 404 already sent. */
async function ownJob(id, scope, res) {
  const job = Number.isInteger(id) && id > 0 ? await queryOne('select * from jobs where id = $1', [id]) : null;
  const business = job && scope.businesses.includes(job.site) ? await businessFor(job.site) : null;
  if (!job || !business || business.payout_model === 'damp') {
    json(res, 404, { ok: false, error: 'not_found' });
    return null;
  }
  return { job, business };
}

async function list(req, res, scope) {
  const url = new URL(req.url, 'http://localhost');
  const sites = sitesFor(scope, normaliseSite(url.searchParams.get('site')));
  const rows = await query(
    `select j.* from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and b.payout_model <> 'damp'
        and j.created_at >= ${since(url.searchParams.get('range'))}
      order by j.job_date desc nulls last, j.id desc limit 300`,
    [sites]
  );
  const businesses = new Map();
  const jobs = [];
  for (const row of rows) {
    if (!businesses.has(row.site)) businesses.set(row.site, await businessFor(row.site));
    jobs.push(await present(row, businesses.get(row.site)));
  }
  json(res, 200, { ok: true, jobs });
}

async function save(res, body, scope) {
  const id = body.id == null ? null : Number(body.id);
  const site = normaliseSite(body.site);
  const business = site && scope.businesses.includes(site) ? await businessFor(site) : null;
  if (!business || business.payout_model === 'damp') {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }
  const errors = {};
  const invoice = pence(body.invoiceNetPence);
  if (invoice === null || Number.isNaN(invoice) || invoice < 0) errors.invoiceNetPence = 'Enter the invoice figure, net of VAT, in pounds.';
  const status = QUOTED_STATUSES.includes(body.status) ? body.status : 'quoted';
  const jobDate = str(body.jobDate, 10) || null;
  if (jobDate && !/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) errors.jobDate = 'Enter a date as YYYY-MM-DD.';
  const jobTime = str(body.jobTime, 5) || null;
  if (jobTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jobTime)) errors.jobTime = 'Enter a time as HH:MM.';
  const finder = body.finderPersonId == null || body.finderPersonId === '' ? null : Number(body.finderPersonId);
  if (finder !== null && (!Number.isInteger(finder) || !(await queryOne('select 1 from people where id = $1', [finder])))) errors.finderPersonId = 'Choose who brought the job in.';
  if (Object.keys(errors).length) {
    json(res, 400, { ok: false, errors });
    return;
  }

  const fields = {
    customer_name: str(body.customerName, 120) || null,
    customer_postcode: str(body.customerPostcode, 12) || null,
    note: str(body.note, 2000) || null,
    invoice_net_pence: invoice,
    status,
    job_date: jobDate,
    job_time: jobTime,
    finder_person_id: finder
  };

  let before = null;
  let row;
  if (id) {
    const own = await ownJob(id, scope, res);
    if (!own) return;
    before = await present(own.job, own.business);
    if (own.job.site !== site) {
      json(res, 400, { ok: false, errors: { site: 'A job cannot move between businesses.' } });
      return;
    }
    row = await queryOne(
      `update jobs set customer_name = $2, customer_postcode = $3, note = $4, invoice_net_pence = $5, status = $6,
              job_date = coalesce($7::date, job_date), job_time = $8::time, finder_person_id = $9, updated_at = now()
        where id = $1 returning *`,
      [id, fields.customer_name, fields.customer_postcode, fields.note, fields.invoice_net_pence, fields.status, fields.job_date, fields.job_time, fields.finder_person_id]
    );
  } else {
    /* The rates the job is created under, copied from the business so a later
       change to the business never rewrites this job. */
    row = await queryOne(
      `insert into jobs (site, lead_id, customer_name, customer_postcode, note, invoice_net_pence, status, job_date, job_time, finder_person_id,
                         reserve_bp, fee_bp, fee_floor_pence, split_bp, surveyor, survey_price_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::date, ${TODAY}), $9::time, $10, $11, $12, $13, $14, null, 0, 0, 0, '', '', '')
       returning *`,
      [site, body.leadId == null ? null : Number(body.leadId), fields.customer_name, fields.customer_postcode, fields.note, fields.invoice_net_pence, fields.status,
       fields.job_date, fields.job_time, fields.finder_person_id, business.tax_reserve_bp, business.fee_bp, business.fee_floor_pence, business.split_bp]
    );
  }
  const after = await present(row, business);
  await record({ scope, business: site, entity: 'job', entityId: row.id, action: id ? 'quoted_update' : 'quoted_create', before, after });
  json(res, 200, { ok: true, job: after });
}

async function change(res, body, scope) {
  const own = await ownJob(Number(body.id), scope, res);
  if (!own) return;
  const { job, business } = own;
  const site = job.site;
  const before = await present(job, business);
  const op = body.op;

  if (op === 'cost') {
    const amount = pence(body.amountPence);
    const label = str(body.label, 80);
    if (!label || amount === null || Number.isNaN(amount) || amount < 0) {
      json(res, 400, { ok: false, errors: { cost: 'A cost needs a label and a figure in pounds.' } });
      return;
    }
    await query('insert into job_costs (job_id, label, amount_pence, added_by, receipt_url) values ($1, $2, $3, $4, $5)',
      [job.id, label, amount, scope.personId, str(body.receiptUrl, 500) || null]);
  } else if (op === 'uncost') {
    await query('delete from job_costs where id = $1 and job_id = $2', [Number(body.costId), job.id]);
  } else if (op === 'days') {
    const personId = Number(body.personId);
    const days = Number(body.days);
    /* No rate given means the business's starting rate; the row keeps whatever
       it was saved at, so a later change to the business moves nothing here. */
    const rate = body.dayRatePence == null || body.dayRatePence === '' ? Number(business.day_rate_pence) : pence(body.dayRatePence);
    if (!Number.isInteger(personId) || !(days >= 0) || rate === null || Number.isNaN(rate) || rate < 0) {
      json(res, 400, { ok: false, errors: { days: 'Who, how many days, and the day rate.' } });
      return;
    }
    if (days === 0) {
      await query('delete from job_owner_days where job_id = $1 and person_id = $2', [job.id, personId]);
    } else {
      await query(
        `insert into job_owner_days (job_id, person_id, days, day_rate_pence) values ($1, $2, $3, $4)
         on conflict (job_id, person_id) do update set days = excluded.days, day_rate_pence = excluded.day_rate_pence`,
        [job.id, personId, days, rate]
      );
    }
  } else if (op === 'payment') {
    const amount = pence(body.amountPence);
    const label = ['deposit', 'stage', 'balance', 'retention', 'refund', 'payment'].includes(body.label) ? body.label : 'payment';
    const paidOn = str(body.paidOn, 10) || null;
    if (amount === null || Number.isNaN(amount) || amount === 0 || (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn))) {
      json(res, 400, { ok: false, errors: { payment: 'A payment needs a figure, and a date if not today.' } });
      return;
    }
    await query(`insert into job_payments (job_id, amount_pence, paid_on, label, note, added_by) values ($1, $2, coalesce($3::date, ${TODAY}), $4, $5, $6)`,
      [job.id, amount, paidOn, label, str(body.note, 500) || null, scope.personId]);
  } else if (op === 'unpay') {
    await query('delete from job_payments where id = $1 and job_id = $2 and bank_txn_id is null', [Number(body.paymentId), job.id]);
  } else if (op === 'freeze') {
    if (!canManage(scope, site)) { json(res, 403, { ok: false, error: 'forbidden' }); return; }
    const lines = await loadLines(job.id);
    const state = paymentState(job, lines.payments);
    if (!state.paidInFull) {
      json(res, 400, { ok: false, errors: { freeze: `Not paid in full: ${state.receivedPence} of ${state.invoicePence} received.` } });
      return;
    }
    const result = payoutFor(business.payout_model, engineInput(job, lines));
    /* Who each first name is on this business, for the engine that names its
       halves. Two of the same first name is nobody, and the row waits. */
    const named = await query(
      `select p.id, lower(split_part(p.name, ' ', 1)) as first from people p join grants g on g.person_id = p.id
        where g.business_slug = $1 and p.active`, [site]);
    const byName = {};
    for (const r of named) byName[r.first] = r.first in byName ? null : Number(r.id);
    const rows = ledgerRows(business.payout_model, job, result, byName);
    await query('delete from payouts where job_id = $1', [job.id]);
    for (const r of rows) {
      await query('insert into payouts (job_id, person_id, person_key, amount_pence) values ($1, $2, $3, $4)', [job.id, r.personId, r.key, r.amountPence]);
    }
    await query(`update jobs set payout_frozen_at = now(), payout_frozen_by = $2, status = 'paid', updated_at = now() where id = $1`, [job.id, scope.personId]);
  } else if (op === 'unfreeze') {
    const reason = str(body.reason, 500);
    if (!scope.isAdmin) { json(res, 403, { ok: false, error: 'forbidden' }); return; }
    if (!reason) { json(res, 400, { ok: false, errors: { reason: 'Say why the stored figure is being reopened.' } }); return; }
    await query(`update payouts set override_reason = $2 where job_id = $1`, [job.id, reason]);
    await query(`update jobs set payout_frozen_at = null, payout_frozen_by = null, status = 'completed', updated_at = now() where id = $1`, [job.id]);
  } else {
    json(res, 400, { ok: false, error: 'unknown_op' });
    return;
  }

  const fresh = await queryOne('select * from jobs where id = $1', [job.id]);
  const after = await present(fresh, business);
  await record({ scope, business: site, entity: 'job', entityId: job.id, action: `quoted_${op}`, before, after });
  json(res, 200, { ok: true, job: after });
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
    console.error('quoted request failed:', err.message);
    json(res, 500, { ok: false, error: 'quoted_failed' });
  }
}
