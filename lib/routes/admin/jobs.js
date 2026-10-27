/**
 * /api/admin/jobs
 *
 *   GET     list jobs for a range, with what each person earned
 *   POST    create a job, or update one when an id is supplied
 *   DELETE  remove a job by id
 *
 * All amounts crossing this boundary are whole pence. Pounds are a display
 * format and are converted at the edge, so no fraction ever reaches the maths.
 *
 * A job stores the rates it was agreed at. Creating one takes today's settings;
 * editing one keeps the rates already on the row, so correcting a customer name
 * or adding remedial work later cannot quietly reprice the job. Changing the
 * rate card affects new jobs only, which is the entire point of storing them.
 */
import { refuseTravel } from '../../travel-guard.js';
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope, sitesFor, requestedSites } from '../../access.js';
import { record } from '../../audit.js';
import { normaliseSite } from '../../site.js';
import { calcJob, SURVEYORS } from '../../splits.js';
import { TODAY, daysAgo } from '../../today.js';
import { resolveAmounts, contactFrom } from '../../job-amounts.js';
import { surveyFields } from '../../estate-agents.js';
import { jobTotals, records } from '../../job-totals.js';

export const config = { runtime: 'nodejs' };

const MAX_LIMIT = 500;
const STATUSES = ['booked', 'completed', 'cancelled'];

function sinceExpr(range) {
  switch (range) {
    case 'today':
      return `${TODAY}`;
    case '30d':
      return daysAgo(30);
    case '90d':
      return daysAgo(90);
    case 'all':
      return `'-infinity'::date`;
    default:
      return daysAgo(7);
  }
}

function pence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded < 0 ? null : rounded;
}

function toRow(r) {
  return {
    id: Number(r.id),
    createdAt: r.created_at,
    leadId: r.lead_id == null ? null : Number(r.lead_id),
    site: r.site,
    jobDate: r.job_date,
    jobTime: r.job_time ? String(r.job_time).slice(0, 5) : null,
    customerName: r.customer_name,
    customerPostcode: r.customer_postcode,
    note: r.note,
    surveyType: r.survey_type,
    surveyPricePence: r.survey_price_pence,
    surveyor: r.surveyor,
    surveyorFeePence: r.surveyor_fee_pence,
    remedialPence: r.remedial_pence,
    status: r.status,
    depositPaidAt: r.deposit_paid_at,
    paidAt: r.paid_at,
    rates: {
      taxBp: r.tax_bp,
      leadBp: r.lead_bp,
      leadEarner: r.lead_earner,
      partners: [r.partner_a, r.partner_b]
    },
    /* Ronnie's pay is his surveyor fee, listed only on the jobs he surveyed;
       nothing is his on a cancelled job. */
    pay: { scott: r.pay_scott_pence, tom: r.pay_tom_pence, ben: r.pay_ben_pence,
      ...(r.surveyor === 'ronnie' ? { ronnie: r.status === 'cancelled' ? 0 : Number(r.surveyor_fee_pence) || 0 } : {}) }
  };
}

async function settings() {
  const s = await queryOne('select * from job_settings where id = true');
  return {
    taxBp: s.tax_bp,
    leadBp: s.lead_bp,
    leadEarner: s.lead_earner,
    partners: [s.partner_a, s.partner_b]
  };
}

async function list(req, res, scope) {
  const url = new URL(req.url, 'http://localhost');
  const range = url.searchParams.get('range') || '7d';
  const site = normaliseSite(url.searchParams.get('site'));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 200));

  // Always filtered now, to the scope or to one business inside it. Two
  // statements, two parameter lists: sharing one array between them is how the
  // placeholder numbers silently drift apart.
  const siteFilter = ' and site = any($1::text[])';
  const siteParams = [requestedSites(scope, url.searchParams)];

  const rows = await query(
    `select * from jobs
      where job_date >= ${sinceExpr(range)}${siteFilter}
      order by job_date desc, id desc
      limit ${limit}`,
    siteParams
  );

  /* Damp surveys only, work done apart from work booked ahead (lib/job-totals.js). */
  const totals = await jobTotals(siteParams[0], sinceExpr(range));

  json(res, 200, {
    ok: true,
    range,
    site,
    jobs: rows.map(toRow),
    totals
  });
}

async function save(req, res, body, scope) {
  const id = body.id == null ? null : Number(body.id);

  /* The business the job belongs to, decided before anything is computed. A
     person with one business gets it by default; the legacy shared login and
     anyone with several fall back to DampScan as the form always has. Either
     way it must be inside the scope, or the answer is 403 and nothing runs. */
  const site = normaliseSite(body.site)
    || (scope.businesses.length === 1 ? scope.businesses[0] : 'dampscan');
  if (!scope.businesses.includes(site)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }
  /* "Tom" said aloud is the key 'tom'. */
  const surveyor = (str(body.surveyor, 20) || '').trim().toLowerCase();
  if (!SURVEYORS.includes(surveyor)) {
    json(res, 400, { ok: false, errors: { surveyor: `Choose who surveyed it: ${SURVEYORS.join(', ')}.` } });
    return;
  }

  const amounts = await resolveAmounts(body);
  if (amounts.error) {
    json(res, 400, { ok: false, errors: amounts.error });
    return;
  }

  const contact = contactFrom(body, !id);
  /* The estate agent and the agent wait, from the survey board's booking. */
  const extra = contact.errors ? contact : await surveyFields(body);
  if (extra.errors) {
    json(res, 400, { ok: false, errors: extra.errors });
    return;
  }
  const remedial = pence(body.remedialPence) ?? 0;
  const status = STATUSES.includes(body.status) ? body.status : 'booked';

  // An edit keeps the rates the job was agreed at. Only a new job takes today's.
  let rates;
  let before = null;
  if (id) {
    const existing = await queryOne('select * from jobs where id = $1', [id]);
    /* Outside the scope is indistinguishable from absent, on purpose. */
    if (!existing || !scope.businesses.includes(existing.site)) {
      json(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    before = existing;
    rates = {
      taxBp: existing.tax_bp,
      leadBp: existing.lead_bp,
      leadEarner: existing.lead_earner,
      partners: [existing.partner_a, existing.partner_b]
    };
  } else {
    rates = await settings();
  }

  if (status === 'booked' && await refuseTravel(res, { surveyor, site, date: str(body.jobDate, 10), time: str(body.jobTime, 5), postcode: str(body.customerPostcode, 12) || before?.customer_postcode, exceptJob: id || null, force: body.force })) return;
  const calc = calcJob({
    surveyPence: amounts.price,
    surveyorFeePence: amounts.fee,
    remedialPence: remedial,
    surveyor,
    ...rates
  });

  const values = [
    body.leadId == null ? null : Number(body.leadId),
    site,
    str(body.jobDate, 10) || null,
    str(body.jobTime, 5) || null,
    str(body.customerName, 120) || null,
    str(body.customerPostcode, 12) || null,
    str(body.note, 2000) || null,
    amounts.type,
    amounts.price,
    surveyor,
    amounts.fee,
    remedial,
    status,
    rates.taxBp,
    rates.leadBp,
    rates.leadEarner,
    rates.partners[0],
    rates.partners[1],
    calc.pay.scott,
    calc.pay.tom,
    calc.pay.ben,
    ...contact.values, ...extra.values
  ];

  const COLUMNS = [
    'lead_id', 'site', 'job_date', 'job_time', 'customer_name', 'customer_postcode', 'note',
    'survey_type', 'survey_price_pence', 'surveyor', 'surveyor_fee_pence',
    'remedial_pence', 'status', 'tax_bp', 'lead_bp', 'lead_earner',
    'partner_a', 'partner_b', 'pay_scott_pence', 'pay_tom_pence', 'pay_ben_pence', ...contact.columns, ...extra.columns
  ];
  // job_date may be null, in which case the database supplies today. Column index and
  // parameter number differ once an id occupies $1, so both are passed rather than inferred.
  const placeholder = (col, param) =>
    (COLUMNS[col] === 'job_date' ? `coalesce($${param}::date, ${TODAY})` : COLUMNS[col] === 'job_time' ? `$${param}::time` : `$${param}`);

  let row;
  if (id) {
    const sets = COLUMNS.map((c, i) => `${c} = ${placeholder(i, i + 2)}`).join(', ');
    row = await queryOne(
      `update jobs set ${sets}, updated_at = now() where id = $1 returning *`,
      [id, ...values]
    );
  } else {
    row = await queryOne(
      `insert into jobs (${COLUMNS.join(', ')})
       values (${COLUMNS.map((_, i) => placeholder(i, i + 1)).join(', ')})
       returning *`,
      values
    );
  }

  /* A new job given a date was booked for it; edits count via the jobs trigger (schema.sql). */
  if (!id && values[COLUMNS.indexOf('job_date')]) row = await queryOne('update jobs set date_set = true where id = $1 returning *', [row.id]);
  await record({
    scope, business: row.site, entity: 'job', entityId: row.id, action: id ? 'job_update' : 'job_create',
    before: before && toRow(before), after: toRow(row)
  });
  json(res, 200, { ok: true, job: toRow(row), breakdown: calc });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;

  try {
    if (req.method === 'GET') {
      if (new URL(req.url, 'http://x').searchParams.get('view') === 'records') {
        const sites = requestedSites(scope, new URL(req.url, 'http://x').searchParams);
        const money = sites.some((x) => scope.isAdmin || (scope.levels || {})[x] === 'manage');
        return json(res, 200, { ok: true, records: await records(sites, money) });
      }
      return await list(req, res, scope);
    }

    const body = await readJson(req);

    if (req.method === 'DELETE') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        json(res, 400, { ok: false, error: 'bad_id' });
        return;
      }
      /* Deleting is the one write that leaves no row to explain itself, so
         the audit row carries the whole job. */
      /* Only someone who manages the business may delete its jobs. */
      const managed = scope.businesses.filter((b) => scope.isAdmin || (scope.levels || {})[b] === 'manage');
      const gone = await queryOne('delete from jobs where id = $1 and site = any($2::text[]) returning *', [id, managed]);
      if (!gone) {
        json(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      await record({ scope, business: gone.site, entity: 'job', entityId: id, action: 'job_delete', before: toRow(gone), after: null });
      json(res, 200, { ok: true });
      return;
    }

    return await save(req, res, body, scope);
  } catch (err) {
    console.error('jobs request failed:', err.message);
    json(res, 500, { ok: false, error: 'jobs_failed' });
  }
}
