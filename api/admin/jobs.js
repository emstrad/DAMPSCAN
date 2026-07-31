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
import { query, queryOne } from '../../lib/db.js';
import { json, requireMethod, readJson, str } from '../../lib/http.js';
import { requireAuth } from '../../lib/session.js';
import { normaliseSite } from '../../lib/site.js';
import { calcJob, PEOPLE } from '../../lib/splits.js';

export const config = { runtime: 'nodejs' };

const MAX_LIMIT = 500;
const STATUSES = ['booked', 'completed', 'cancelled'];

function sinceExpr(range) {
  switch (range) {
    case 'today':
      return `(current_date)`;
    case '30d':
      return `(current_date - 30)`;
    case '90d':
      return `(current_date - 90)`;
    case 'all':
      return `'-infinity'::date`;
    default:
      return `(current_date - 7)`;
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
    customerName: r.customer_name,
    customerPostcode: r.customer_postcode,
    note: r.note,
    surveyType: r.survey_type,
    surveyPricePence: r.survey_price_pence,
    surveyor: r.surveyor,
    surveyorFeePence: r.surveyor_fee_pence,
    remedialPence: r.remedial_pence,
    status: r.status,
    rates: {
      taxBp: r.tax_bp,
      leadBp: r.lead_bp,
      leadEarner: r.lead_earner,
      partners: [r.partner_a, r.partner_b]
    },
    pay: { scott: r.pay_scott_pence, tom: r.pay_tom_pence, ben: r.pay_ben_pence }
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

/** Resolve price and surveyor fee: an explicit figure wins, else the rate card. */
async function resolveAmounts(body) {
  const type = str(body.surveyType, 60) || null;
  let price = pence(body.surveyPricePence);
  let fee = pence(body.surveyorFeePence);

  if (type) {
    const rate = await queryOne(
      'select price_pence, surveyor_fee_pence from job_rates where key = $1',
      [type]
    );
    if (!rate) return { error: { surveyType: 'Unknown survey type.' } };
    if (price == null) price = rate.price_pence;
    if (fee == null) fee = rate.surveyor_fee_pence;
  }

  if (price == null) return { error: { surveyPricePence: 'Enter a survey price.' } };
  if (fee == null) fee = 0;
  return { type, price, fee };
}

async function list(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const range = url.searchParams.get('range') || '7d';
  const site = normaliseSite(url.searchParams.get('site'));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 200));

  // Two statements, two parameter lists. Sharing one array between them is how
  // the placeholder numbers silently drift apart.
  const siteFilter = site ? ' and site = $1' : '';
  const siteParams = site ? [site] : [];

  const rows = await query(
    `select * from jobs
      where job_date >= ${sinceExpr(range)}${siteFilter}
      order by job_date desc, id desc
      limit ${limit}`,
    siteParams
  );

  // Totals exclude cancelled jobs: nobody is paid for one.
  const totals = await queryOne(
    `select coalesce(sum(pay_scott_pence),0)    as scott,
            coalesce(sum(pay_tom_pence),0)      as tom,
            coalesce(sum(pay_ben_pence),0)      as ben,
            coalesce(sum(survey_price_pence),0) as survey_value,
            coalesce(sum(remedial_pence),0)     as remedial_value,
            count(*)                            as jobs
       from jobs
      where job_date >= ${sinceExpr(range)} and status <> 'cancelled'${siteFilter}`,
    siteParams
  );

  json(res, 200, {
    ok: true,
    range,
    site,
    jobs: rows.map(toRow),
    totals: {
      jobs: Number(totals.jobs),
      surveyValuePence: Number(totals.survey_value),
      remedialValuePence: Number(totals.remedial_value),
      pay: { scott: Number(totals.scott), tom: Number(totals.tom), ben: Number(totals.ben) }
    }
  });
}

async function save(req, res, body) {
  const id = body.id == null ? null : Number(body.id);
  const surveyor = str(body.surveyor, 20);
  if (!PEOPLE.includes(surveyor)) {
    json(res, 400, { ok: false, errors: { surveyor: 'Choose who surveyed it.' } });
    return;
  }

  const amounts = await resolveAmounts(body);
  if (amounts.error) {
    json(res, 400, { ok: false, errors: amounts.error });
    return;
  }

  const remedial = pence(body.remedialPence) ?? 0;
  const status = STATUSES.includes(body.status) ? body.status : 'booked';

  // An edit keeps the rates the job was agreed at. Only a new job takes today's.
  let rates;
  if (id) {
    const existing = await queryOne(
      'select tax_bp, lead_bp, lead_earner, partner_a, partner_b from jobs where id = $1',
      [id]
    );
    if (!existing) {
      json(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    rates = {
      taxBp: existing.tax_bp,
      leadBp: existing.lead_bp,
      leadEarner: existing.lead_earner,
      partners: [existing.partner_a, existing.partner_b]
    };
  } else {
    rates = await settings();
  }

  const calc = calcJob({
    surveyPence: amounts.price,
    surveyorFeePence: amounts.fee,
    remedialPence: remedial,
    surveyor,
    ...rates
  });

  const values = [
    body.leadId == null ? null : Number(body.leadId),
    normaliseSite(body.site) || 'dampscan',
    str(body.jobDate, 10) || null,
    str(body.customerName, 120) || null,
    str(body.customerPostcode, 12) || null,
    str(body.note, 500) || null,
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
    calc.pay.ben
  ];

  const COLUMNS = [
    'lead_id', 'site', 'job_date', 'customer_name', 'customer_postcode', 'note',
    'survey_type', 'survey_price_pence', 'surveyor', 'surveyor_fee_pence',
    'remedial_pence', 'status', 'tax_bp', 'lead_bp', 'lead_earner',
    'partner_a', 'partner_b', 'pay_scott_pence', 'pay_tom_pence', 'pay_ben_pence'
  ];
  // job_date may be null, in which case the database supplies today. The column
  // index and the parameter number are not the same once an id occupies $1, so
  // both are passed rather than inferred.
  const placeholder = (col, param) =>
    (COLUMNS[col] === 'job_date' ? `coalesce($${param}::date, current_date)` : `$${param}`);

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

  json(res, 200, { ok: true, job: toRow(row), breakdown: calc });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') return await list(req, res);

    const body = await readJson(req);

    if (req.method === 'DELETE') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        json(res, 400, { ok: false, error: 'bad_id' });
        return;
      }
      await query('delete from jobs where id = $1', [id]);
      json(res, 200, { ok: true });
      return;
    }

    return await save(req, res, body);
  } catch (err) {
    console.error('jobs request failed:', err.message);
    json(res, 500, { ok: false, error: 'jobs_failed' });
  }
}
