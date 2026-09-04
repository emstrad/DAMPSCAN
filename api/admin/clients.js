/**
 * /api/admin/clients
 *
 *   GET   ?view=upcoming|archive|all&site=   the client cards
 *   POST  {id, depositPaid?, paid?, jobDate?, note?}   update one card
 *
 * A client card is a booked job joined to the enquiry it came from, so there
 * is no clients table: creating a job on the Jobs page is what creates a card,
 * and the card shows the lead's address, contact details and attachments
 * without anybody typing them in again. A job recorded by hand with no lead
 * still gets a card, with whatever the job form was given.
 *
 * The deposit is always half the survey price. It is derived here rather than
 * stored, so a job whose price is corrected on the Jobs page shows the right
 * deposit on its card without a second edit. The odd penny, if there is one,
 * goes on the deposit.
 *
 * A card archives itself the day after its survey date. That is a view, not a
 * status change: the job stays booked until somebody marks it completed on the
 * Jobs page, because a survey whose date has passed may have been rescheduled
 * rather than done, and the earnings tiles should not be told otherwise by a
 * calendar. "Today" is London's today, not the server's, so a card does not
 * archive an hour early in summer.
 *
 * Paid and deposit are timestamps set when a box is ticked and cleared when it
 * is unticked. Ticking a box that is already ticked keeps the original time:
 * "paid on the 3rd" must not become "paid today" because somebody saved the
 * notes. This is also the shape a payment webhook writes to later, so
 * automating it is a caller change and not a schema one.
 */
import { query, queryOne } from '../../lib/db.js';
import { json, requireMethod, readJson, str } from '../../lib/http.js';
import { requireAuth } from '../../lib/session.js';
import { normaliseSite } from '../../lib/site.js';

export const config = { runtime: 'nodejs' };

const TODAY = `(now() at time zone 'Europe/London')::date`;

const SELECT = `
  select j.id, j.created_at, j.updated_at, j.lead_id, j.site, j.job_date, j.status,
         (j.status = 'completed' or j.job_date < ${TODAY}) as archived,
         j.customer_name, j.customer_postcode, j.note, j.survey_type, j.survey_price_pence,
         j.remedial_pence, j.surveyor, j.deposit_paid_at, j.paid_at,
         r.label as survey_label,
         l.first_name, l.email, l.phone, l.postcode, l.address_line1, l.address_line2, l.town,
         l.files, l.issues, l.previous_survey, l.notes as lead_notes
    from jobs j
    left join leads l on l.id = j.lead_id
    left join job_rates r on r.key = j.survey_type`;

/* A date column comes back as '2026-09-18' from the Neon HTTP driver and as a
   Date at local midnight from pg. Both become the same ten characters, and the
   Date is read with local getters so a non-UTC zone cannot shift the day. */
export function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

export function toCard(r) {
  const price = Number(r.survey_price_pence) || 0;
  const deposit = Math.ceil(price / 2);
  return {
    id: Number(r.id),
    leadId: r.lead_id == null ? null : Number(r.lead_id),
    site: r.site,
    status: r.status,
    /* Decided by the database against London's date, so every browser agrees
       with the server about which board a card is on. */
    archived: Boolean(r.archived),
    surveyDate: isoDate(r.job_date),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    /* The job's own name and postcode win, because they are what staff typed
       or corrected. The lead fills in behind them. */
    name: r.customer_name || r.first_name || null,
    email: r.email || null,
    phone: r.phone || null,
    address: {
      line1: r.address_line1 || null,
      line2: r.address_line2 || null,
      town: r.town || null,
      postcode: r.customer_postcode || r.postcode || null
    },
    issues: r.issues || [],
    previousSurvey: r.previous_survey,
    leadNotes: r.lead_notes || null,
    files: r.files || [],
    survey: {
      type: r.survey_type,
      label: r.survey_label || (r.survey_type ? r.survey_type : 'One off'),
      surveyor: r.surveyor,
      pricePence: price,
      remedialPence: Number(r.remedial_pence) || 0
    },
    money: {
      depositPence: deposit,
      balancePence: price - deposit,
      depositPaidAt: r.deposit_paid_at,
      paidAt: r.paid_at
    },
    note: r.note || null
  };
}

const VIEWS = {
  upcoming: { where: `j.status = 'booked' and j.job_date >= ${TODAY}`, order: 'j.job_date asc, j.id asc' },
  archive:  { where: `(j.status = 'completed' or j.job_date < ${TODAY})`, order: 'j.job_date desc, j.id desc' },
  all:      { where: 'true', order: 'j.job_date desc, j.id desc' }
};

async function list(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const param = url.searchParams.get('view') || 'upcoming';
  const view = VIEWS[param] ? param : 'upcoming';
  const site = normaliseSite(url.searchParams.get('site'));

  const rows = await query(
    `${SELECT}
      where j.status <> 'cancelled'
        and ${VIEWS[view].where}
        and ($1::text is null or j.site = $1::text)
      order by ${VIEWS[view].order}
      limit 500`,
    [site]
  );
  json(res, 200, { ok: true, view, site, clients: rows.map(toCard) });
}

/* A tick sets the time if it is not already set; an untick clears it. $N is
   filled in with the parameter's real position by add() below. */
const TICK = (col) => `${col} = case when $N::boolean then coalesce(${col}, now()) else null end`;

async function update(req, res, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    json(res, 400, { ok: false, error: 'bad_id' });
    return;
  }

  const sets = [];
  const params = [id];
  const add = (fragment, value) => { params.push(value); sets.push(fragment.replaceAll('$N', `$${params.length}`)); };

  if (typeof body.depositPaid === 'boolean') add(TICK('deposit_paid_at'), body.depositPaid);
  if (typeof body.paid === 'boolean') {
    add(TICK('paid_at'), body.paid);
    /* Paid in full means the deposit has been paid too, whatever the box
       says. Unticking paid leaves the deposit alone, since it usually was.
       Order matters: this runs after the deposit tick above, so "deposit
       unticked, paid ticked" in one save still ends with the deposit set. */
    if (body.paid) sets.push(`deposit_paid_at = coalesce(deposit_paid_at, now())`);
  }
  if (body.jobDate !== undefined) {
    const date = str(body.jobDate, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      json(res, 400, { ok: false, errors: { jobDate: 'Enter a date as YYYY-MM-DD.' } });
      return;
    }
    add(`job_date = coalesce($N::date, job_date)`, date || null);
  }
  if (body.note !== undefined) add(`note = $N`, str(body.note, 2000) || null);

  if (!sets.length) {
    json(res, 400, { ok: false, error: 'nothing_to_update' });
    return;
  }

  const updated = await queryOne(
    `update jobs set ${sets.join(', ')}, updated_at = now() where id = $1 returning id`,
    params
  );
  if (!updated) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  const row = await queryOne(`${SELECT} where j.id = $1`, [id]);
  json(res, 200, { ok: true, client: toCard(row) });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') return await list(req, res);
    return await update(req, res, await readJson(req));
  } catch (err) {
    console.error('clients request failed:', err.message);
    json(res, 500, { ok: false, error: 'clients_failed' });
  }
}
