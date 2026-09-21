/**
 * A quoted-trade job, loaded whole, with its payout worked out.
 *
 * Roofing and air conditioning jobs live in the same jobs table as the damp
 * surveys but carry different fields: an invoice, a list of cost lines, for
 * roofing the days each owner worked, and a list of payments rather than two
 * tick boxes. This is the one place those are read together and handed to the
 * engine, so the list, the card, the working screen and the freeze all see the
 * same figure.
 *
 * Two figures are returned for a frozen job. `payout` is what the engine says
 * now, from the current lines. `frozen` is what was written when the money
 * cleared. They differ when a cost is entered late, and the difference is
 * reported rather than resolved: the stored figure stands, the screen says
 * what it would now be, and an admin decides.
 */
import { query, queryOne } from './db.js';
import { payoutFor } from './payout/index.js';

export const QUOTED_STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled', 'paid', 'refunded'];

const N = (v) => Number(v) || 0;

export async function businessFor(site) {
  return queryOne('select slug, name, payout_model, tax_reserve_bp, fee_bp, fee_floor_pence, split_bp, day_rate_pence from businesses where slug = $1 and active', [site]);
}

/** The rows the engine needs, in one round trip each. */
export async function loadLines(jobId) {
  const [costs, ownerDays, payments, frozen] = await Promise.all([
    query('select id, label, amount_pence, added_by, added_at, receipt_url from job_costs where job_id = $1 order by added_at, id', [jobId]),
    query('select d.id, d.person_id, p.name, d.days, d.day_rate_pence from job_owner_days d join people p on p.id = d.person_id where d.job_id = $1 order by d.id', [jobId]),
    query('select id, amount_pence, paid_on, label, note, bank_txn_id, added_by from job_payments where job_id = $1 order by paid_on, id', [jobId]),
    query('select person_id, person_key, amount_pence, computed_at, override_reason from payouts where job_id = $1 order by person_key', [jobId])
  ]);
  return { costs, ownerDays, payments, frozen };
}

/** Engine input from a job row and its lines. */
export function engineInput(job, lines) {
  return {
    invoiceNetPence: N(job.invoice_net_pence),
    costs: lines.costs.map((c) => ({ label: c.label, amountPence: N(c.amount_pence) })),
    ownerDays: lines.ownerDays.map((d) => ({ personId: Number(d.person_id), days: Number(d.days), dayRatePence: N(d.day_rate_pence) })),
    reserveBp: job.reserve_bp,
    feeBp: job.fee_bp,
    feeFloorPence: job.fee_floor_pence,
    splitBp: job.split_bp
  };
}

/**
 * What each person is owed, as rows the payouts table stores. The keys are
 * the engine's names: 'finder' for the roofing fee, 'owner:<id>' per working
 * owner, and 'scott' / 'tom' for the air conditioning halves.
 */
export function payoutRows(model, job, result) {
  if (model === 'roofing') {
    const rows = [];
    if (job.finder_person_id) rows.push({ personId: Number(job.finder_person_id), key: 'finder', amountPence: result.scottFee });
    for (const d of result.ownerDays) rows.push({ personId: d.personId, key: `owner:${d.personId}`, amountPence: d.wagePence });
    return rows;
  }
  if (model === 'ac') {
    return result.partners.map((name) => ({ personId: null, key: name, amountPence: result.pay[name] }));
  }
  return [];
}

export function paymentState(job, payments) {
  const invoice = N(job.invoice_net_pence);
  const received = payments.reduce((sum, p) => sum + N(p.amount_pence), 0);
  const dates = payments.map((p) => p.paid_on).filter(Boolean).sort();
  return {
    invoicePence: invoice,
    receivedPence: received,
    outstandingPence: invoice - received,
    paidInFull: invoice > 0 && received >= invoice,
    lastPaidOn: dates.length ? dates[dates.length - 1] : null
  };
}

/** A job row and everything computed from it, as the API returns it. */
export async function present(job, business) {
  const lines = await loadLines(job.id);
  const model = business.payout_model;
  const result = payoutFor(model, engineInput(job, lines));
  const live = payoutRows(model, job, result);
  const frozenTotal = lines.frozen.reduce((s, r) => s + N(r.amount_pence), 0);
  const liveTotal = live.reduce((s, r) => s + r.amountPence, 0);

  return {
    id: Number(job.id),
    site: job.site,
    business: business.name,
    model,
    status: job.status,
    leadId: job.lead_id == null ? null : Number(job.lead_id),
    customerName: job.customer_name,
    customerPostcode: job.customer_postcode,
    jobDate: job.job_date,
    jobTime: job.job_time ? String(job.job_time).slice(0, 5) : null,
    note: job.note,
    finderPersonId: job.finder_person_id == null ? null : Number(job.finder_person_id),
    invoiceNetPence: N(job.invoice_net_pence),
    rates: { reserveBp: job.reserve_bp, feeBp: job.fee_bp, feeFloorPence: N(job.fee_floor_pence), splitBp: job.split_bp },
    costs: lines.costs.map((c) => ({ id: Number(c.id), label: c.label, amountPence: N(c.amount_pence), addedBy: c.added_by == null ? null : Number(c.added_by), addedAt: c.added_at, receiptUrl: c.receipt_url })),
    ownerDays: lines.ownerDays.map((d) => ({ id: Number(d.id), personId: Number(d.person_id), name: d.name, days: Number(d.days), dayRatePence: N(d.day_rate_pence) })),
    payments: lines.payments.map((p) => ({ id: Number(p.id), amountPence: N(p.amount_pence), paidOn: p.paid_on, label: p.label, note: p.note, fromBank: p.bank_txn_id != null })),
    money: paymentState(job, lines.payments),
    /* The working, in full, so the screen can show every input beside the result. */
    payout: result,
    payoutRows: live,
    frozen: job.payout_frozen_at ? {
      at: job.payout_frozen_at,
      by: job.payout_frozen_by == null ? null : Number(job.payout_frozen_by),
      rows: lines.frozen.map((r) => ({ personId: r.person_id == null ? null : Number(r.person_id), key: r.person_key, amountPence: N(r.amount_pence), overrideReason: r.override_reason })),
      /* Non-zero means a line changed after the money cleared. The stored
         figure stands; this says what it would now be. */
      driftPence: liveTotal - frozenTotal
    } : null
  };
}
