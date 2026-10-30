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
import { loadQuoteLines, presentQuote } from './quote-store.js';
import { loadMessages, presentMessages } from './pipeline.js';
import { loadTime, loadMiles, presentTime } from './job-time.js';
import { profitFor } from './profit.js';
import { brandFor } from './brands.js';
import { grossPence } from './roofing.js';

export const QUOTED_STATUSES = ['quoted', 'booked', 'completed', 'declined', 'cancelled', 'paid', 'refunded'];

const N = (v) => Number(v) || 0;

/* A date column as YYYY-MM-DD whichever driver read it: Neon hands a date
   over as text, pg as a Date at local midnight. */
const dateOnly = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};

export async function businessFor(site) {
  return queryOne('select slug, name, payout_model, tax_reserve_bp, fee_bp, fee_floor_pence, split_bp, day_rate_pence, vat_bp, vat_registered, vat_number, trading_address, company_number, payment_details from businesses where slug = $1 and active', [site]);
}

/** The rows the engine needs, in one round trip each. */
export async function loadLines(jobId) {
  const [costs, ownerDays, payments, frozen, quote, messages, time, miles, ratings, plans] = await Promise.all([
    query('select id, label, amount_pence, added_by, added_at, receipt_url, quote_line_id from job_costs where job_id = $1 order by added_at, id', [jobId]),
    query('select d.id, d.person_id, p.name, d.days, d.day_rate_pence from job_owner_days d join people p on p.id = d.person_id where d.job_id = $1 order by d.id', [jobId]),
    query('select id, amount_pence, paid_on::text as paid_on, label, note, bank_txn_id, added_by from job_payments where job_id = $1 order by paid_on, id', [jobId]),
    query('select person_id, person_key, amount_pence, computed_at, override_reason from payouts where job_id = $1 order by person_key', [jobId]),
    loadQuoteLines(jobId),
    loadMessages(jobId),
    loadTime(jobId),
    loadMiles(jobId),
    query('select stars, comment, created_at from job_ratings where job_id = $1', [jobId]),
    /* A plan made from this job, or one for the same customer at the same
       postcode, means the yearly check is already in hand. */
    query(`select 1 from service_contracts c join jobs j on j.id = $1
            where c.status = 'active' and (c.job_id = j.id or (c.business_slug = j.site and lower(c.customer_name) = lower(j.customer_name)
              and upper(replace(c.customer_postcode, ' ', '')) = upper(replace(j.customer_postcode, ' ', '')))) limit 1`, [jobId])
  ]);
  return { costs, ownerDays, payments, frozen, quote, messages, time, miles, rating: ratings[0] || null, onPlan: plans.length > 0 };
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

/* The ledger rows that are the company's rather than a person's. With the
   people's rows they add back to the invoice, which is what lets the bank
   reconcile a paid job to the penny. */
export const COMPANY_KEYS = ['costs', 'reserve', 'retained'];

/**
 * Everything the freeze writes: the people's rows, each with a person where
 * one is known, and the company's. The air conditioning engine names its two
 * halves rather than identifying them, so `peopleByName` says which person a
 * first name is on this business; nobody, or two, leaves the row unassigned.
 */
export function ledgerRows(model, job, result, peopleByName = {}) {
  const rows = payoutRows(model, job, result).map((r) => ({ ...r, personId: r.personId ?? peopleByName[r.key] ?? null }));
  const company = (key, amountPence) => rows.push({ personId: null, key, amountPence });
  if (model === 'roofing') {
    company('costs', result.directTotal);
    company('reserve', result.reserve);
    company('retained', result.retained);
  } else if (model === 'ac') {
    company('costs', result.costTotal);
    company('retained', result.profit - result.payoutProfit);
  }
  return rows;
}

/* With the business given, the invoice is the gross (net plus VAT), as on the customer's invoice. */
export function paymentState(job, payments, business = null) {
  const invoice = grossPence(N(job.invoice_net_pence), business);
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
  const frozenPeople = lines.frozen.filter((r) => !COMPANY_KEYS.includes(r.person_key));
  const frozenCompany = Object.fromEntries(lines.frozen.filter((r) => COMPANY_KEYS.includes(r.person_key)).map((r) => [r.person_key, N(r.amount_pence)]));
  const frozenTotal = frozenPeople.reduce((s, r) => s + N(r.amount_pence), 0);
  const liveTotal = live.reduce((s, r) => s + r.amountPence, 0);
  const quote = presentQuote(job, business, lines.quote);
  /* What the message builder needs, in the shape it reads. */
  const contact = {
    site: job.site, status: job.status, customerName: job.customer_name, customerPostcode: job.customer_postcode,
    customerPhone: job.customer_phone, customerEmail: job.customer_email, quoteUrl: quote.url,
    quoteSentAt: job.quote_sent_at, jobDate: dateOnly(job.job_date),
    ratingUrl: job.rating_token && brandFor(job.site) ? `${brandFor(job.site).origin}/rate.html?t=${job.rating_token}` : null,
    rated: Boolean(lines.rating), onPlan: lines.onPlan,
    invoiceUrl: quote.invoice ? quote.invoice.url : null, invoiceNumber: quote.invoice ? quote.invoice.number : null, jobTime: job.job_time ? String(job.job_time).slice(0, 5) : null
  };

  return {
    id: Number(job.id),
    site: job.site,
    business: business.name,
    model,
    status: job.status,
    leadId: job.lead_id == null ? null : Number(job.lead_id),
    customerName: job.customer_name,
    customerPostcode: job.customer_postcode,
    customerPhone: job.customer_phone,
    customerEmail: job.customer_email,
    quoteSentAt: job.quote_sent_at,
    jobDate: dateOnly(job.job_date),
    jobTime: job.job_time ? String(job.job_time).slice(0, 5) : null,
    note: job.note,
    finderPersonId: job.finder_person_id == null ? null : Number(job.finder_person_id),
    invoiceNetPence: N(job.invoice_net_pence),
    rates: { reserveBp: job.reserve_bp, feeBp: job.fee_bp, feeFloorPence: N(job.fee_floor_pence), splitBp: job.split_bp },
    costs: lines.costs.map((c) => ({ id: Number(c.id), label: c.label, amountPence: N(c.amount_pence), addedBy: c.added_by == null ? null : Number(c.added_by), addedAt: c.added_at, receiptUrl: c.receipt_url, fromQuote: c.quote_line_id != null })),
    ownerDays: lines.ownerDays.map((d) => ({ id: Number(d.id), personId: Number(d.person_id), name: d.name, days: Number(d.days), dayRatePence: N(d.day_rate_pence) })),
    payments: lines.payments.map((p) => ({ id: Number(p.id), amountPence: N(p.amount_pence), paidOn: p.paid_on, label: p.label, note: p.note, fromBank: p.bank_txn_id != null })),
    money: paymentState(job, lines.payments, business),
    quote,
    messages: presentMessages(contact, lines.messages),
    rating: lines.rating ? { stars: Number(lines.rating.stars), comment: lines.rating.comment, at: lines.rating.created_at } : null,
    time: presentTime(lines.time, lines.miles),
    profit: profitFor(job.invoice_net_pence, lines.costs, lines.time),
    /* The working, in full, so the screen can show every input beside the result. */
    payout: result,
    payoutRows: live,
    frozen: job.payout_frozen_at ? {
      at: job.payout_frozen_at,
      by: job.payout_frozen_by == null ? null : Number(job.payout_frozen_by),
      rows: frozenPeople.map((r) => ({ personId: r.person_id == null ? null : Number(r.person_id), key: r.person_key, amountPence: N(r.amount_pence), overrideReason: r.override_reason })),
      company: { costsPence: frozenCompany.costs || 0, reservePence: frozenCompany.reserve || 0, retainedPence: frozenCompany.retained || 0 },
      /* Non-zero means a line changed after the money cleared. The stored
         figure stands; this says what it would now be. */
      driftPence: liveTotal - frozenTotal
    } : null
  };
}
