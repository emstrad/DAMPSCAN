/**
 * GET  /api/quote?t=<token>
 * GET  /api/quote?t=<token>&doc=invoice   the invoice, once one is issued
 * POST /api/quote  {t, name, agree}     the customer accepts the quote
 * GET  /api/quote?doc=rate&t=<rating token>          the "how did we do" page
 * GET  /api/quote?doc=portal&t=<portal token>[&file=report]   the customer portal (lib/portal.js)
 * POST /api/quote  {doc: 'rate', t, stars, comment?} its answer (lib/rating.js)
 *
 * The customer's view of one quote, found by the random token in the link
 * staff send them. It returns prices only: each line marked up, the net, VAT
 * and the total. Never a cost, the markup, an internal note or anybody's pay.
 *
 * A wrong or old token is a plain 404, so the endpoint cannot be used to
 * learn which quotes exist. Throttled per address for the same reason.
 *
 * Accepting takes the customer's typed name and a tick, and only while the
 * quote is open: still quoted, not withdrawn, within its thirty days and with
 * a price on it. The price is fixed at that moment, and the owner is told.
 */
import { query, queryOne } from '../lib/db.js';
import { json, requireMethod, ipHash, readJson, str } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { money, customer, jobPage } from '../lib/alert-words.js';
import { rateLimit, LIMITS } from '../lib/ratelimit.js';
import { loadQuoteLines, priceFollowsLines } from '../lib/quote-store.js';
import { quoteTotals } from '../lib/quote.js';
import { bpOf } from '../lib/splits.js';
import { brandFor } from '../lib/brands.js';
import { effectiveVatBp, canInvoice } from '../lib/business-details.js';
import { invoiceNumber } from '../lib/quote-store.js';
import { ratingPage, rate } from '../lib/rating.js';
import { findPortal, portalView, portalReport } from '../lib/portal.js';

export const config = { runtime: 'nodejs' };

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const VALID_DAYS = 30;
const N = (v) => Number(v) || 0;

const isoDay = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

async function findJob(token) {
  if (!TOKEN_RE.test(token || '')) return null;
  return queryOne(
    `select j.id, j.site, j.status, j.customer_name, j.customer_postcode, j.markup_bp, j.invoice_net_pence, j.created_at,
            coalesce(j.quote_sent_at, j.created_at) as issued_at,
            j.quote_accepted_at, j.quote_accepted_name, j.price_fixed, j.lead_id, j.invoice_number, j.invoiced_at, j.invoice_due_on::text as invoice_due_on,
            b.vat_bp, b.vat_registered, b.vat_number, b.trading_address, b.company_number, b.payment_details
       from jobs j join businesses b on b.slug = j.site where j.quote_token = $1`, [token]);
}

/** The customer's figures: prices per line, net, VAT and total. */
async function figures(job) {
  const rows = await loadQuoteLines(job.id);
  const totals = quoteTotals(rows.map((r) => ({ kind: r.kind, description: r.description, costPence: N(r.cost_pence) })),
    N(job.markup_bp), effectiveVatBp(job));
  /* The customer sees the job's price. Lines are shown priced only while
     they are the price (still following them, or adding up to it exactly).
     A price agreed or typed by hand, with lines that total something else,
     is shown as the one figure: the lines under it are costs, and scaling
     them would print a "Materials" figure that is really the whole job. */
  const follows = priceFollowsLines(job) && rows.length > 0;
  const netPence = follows ? totals.netPence : N(job.invoice_net_pence);
  const itemised = rows.length > 0 && totals.netPence === netPence;
  const lines = itemised ? totals.customerLines
    : netPence > 0 ? [{ kind: 'other', label: 'Work as quoted', description: `Quote Q-${job.id}`, pricePence: netPence }] : [];
  return { lines, netPence, vatBp: totals.vatBp, vatPence: bpOf(netPence, totals.vatBp) };
}

/* Counted from when the quote went out, not when the card was first made. */
const expired = (job) => Date.now() - new Date(job.issued_at).getTime() > (VALID_DAYS + 1) * 86400000;

/* The invoice: the agreed lines, any VAT, and what has been paid against it.
   Nothing until one has been issued, and nothing while the business's
   details are incomplete, so an invalid invoice is never shown as one. A
   business that is not VAT registered issues a plain invoice with no VAT. */
async function invoice(res, job, brand) {
  if (!job.invoice_number || !canInvoice(job)) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  const { lines, netPence, vatBp, vatPence } = await figures(job);
  const payments = await query('select paid_on::text as paid_on, amount_pence, label from job_payments where job_id = $1 order by paid_on, id', [job.id]);
  const lead = job.lead_id ? await queryOne('select address_line1, address_line2, town, postcode from leads where id = $1', [job.lead_id]) : null;
  const received = payments.reduce((sum, p) => sum + N(p.amount_pence), 0);
  json(res, 200, {
    ok: true,
    brand: { name: brand.name, phone: brand.phone, phoneLabel: brand.phoneLabel, email: brand.email, origin: brand.origin,
      address: job.trading_address, vatNumber: job.vat_registered ? job.vat_number : null, companyNumber: job.company_number, payment: job.payment_details },
    invoice: {
      number: invoiceNumber(brand, job.invoice_number),
      issuedOn: isoDay(job.invoiced_at),
      dueOn: job.invoice_due_on,
      quoteNumber: `Q-${job.id}`,
      customerName: job.customer_name,
      customerAddress: lead ? [lead.address_line1, lead.address_line2, lead.town, lead.postcode].filter(Boolean) : [job.customer_postcode].filter(Boolean),
      lines: lines.length ? lines : [{ label: 'Work as quoted', description: `Quote Q-${job.id}`, pricePence: netPence }],
      netPence, vatBp, vatPence, totalPence: netPence + vatPence,
      payments: payments.map((p) => ({ paidOn: p.paid_on, label: p.label, amountPence: N(p.amount_pence) })),
      receivedPence: received,
      balancePence: Math.max(0, netPence + vatPence - received)
    }
  });
}

async function accept(req, res) {
  const limit = await rateLimit({ ...LIMITS.quoteAccept, ipHash: ipHash(req) });
  if (!limit.ok) { json(res, 429, { ok: false, error: 'too_many_requests' }); return; }
  const body = await readJson(req);
  const job = await findJob(body.t);
  const brand = job && brandFor(job.site);
  if (!job || !brand) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  const name = str(body.name, 80);
  if (!name || name.length < 2 || body.agree !== true) {
    json(res, 400, { ok: false, error: 'incomplete', message: 'Type your name and tick the box to accept.' });
    return;
  }
  const f = await figures(job);
  const open = job.status === 'quoted' && !job.quote_accepted_at && !expired(job) && f.netPence > 0;
  if (!open) { json(res, 409, { ok: false, error: 'not_open', message: 'This quote can no longer be accepted online. Please call us.' }); return; }
  /* One update, guarded on the same conditions, so two taps cannot accept twice. */
  const done = await queryOne(
    `update jobs set quote_accepted_at = now(), quote_accepted_name = $2, quote_accepted_ip_hash = $3, invoice_net_pence = $4, price_fixed = true, updated_at = now()
      where id = $1 and status = 'quoted' and quote_accepted_at is null returning id`, [job.id, name, ipHash(req), f.netPence]);
  if (!done) { json(res, 409, { ok: false, error: 'not_open', message: 'This quote has already been accepted.' }); return; }
  await notify({ business: job.site, kind: 'quote_accepted', ref: job.id, tags: 'handshake', priority: 4, path: jobPage(job.site, job.id),
    title: `Quote accepted: ${brand.name}`,
    message: `${customer(job.customer_name, job.customer_postcode)} accepted the ${money(f.netPence)} quote online. Call to book a start date.` });
  json(res, 200, { ok: true });
}

async function portal(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const found = await findPortal(params.get('t') || '');
  if (found.gone) { json(res, found.gone === 'expired' ? 410 : 404, { ok: false, error: found.gone }); return; }
  if (params.get('file') === 'report') return portalReport(res, found.job);
  json(res, 200, { ok: true, portal: await portalView(found.job) });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    if (req.method === 'POST') {
      const body = await readJson(req);
      req.body = body;
      return await (body.doc === 'rate' ? rate(req, res, body) : accept(req, res));
    }
    const limit = await rateLimit({ ...LIMITS.quote, ipHash: ipHash(req) });
    if (!limit.ok) { json(res, 429, { ok: false, error: 'too_many_requests' }); return; }
    if (new URL(req.url, 'http://localhost').searchParams.get('doc') === 'rate') return await ratingPage(req, res);
    if (new URL(req.url, 'http://localhost').searchParams.get('doc') === 'portal') return await portal(req, res);

    const job = await findJob(new URL(req.url, 'http://localhost').searchParams.get('t') || '');
    const brand = job && brandFor(job.site);
    if (!job || !brand) { json(res, 404, { ok: false, error: 'not_found' }); return; }
    if (new URL(req.url, 'http://localhost').searchParams.get('doc') === 'invoice') return await invoice(res, job, brand);
    const { lines, netPence, vatBp, vatPence } = await figures(job);
    const withdrawn = ['declined', 'cancelled'].includes(job.status);
    const accepted = Boolean(job.quote_accepted_at) || ['booked', 'completed', 'paid'].includes(job.status);

    json(res, 200, {
      ok: true,
      brand: { name: brand.name, phone: brand.phone, phoneLabel: brand.phoneLabel, email: brand.email, origin: brand.origin },
      quote: {
        number: `Q-${job.id}`,
        issuedOn: isoDay(job.issued_at),
        validDays: VALID_DAYS,
        withdrawn,
        accepted,
        acceptedOn: job.quote_accepted_at ? isoDay(job.quote_accepted_at) : null,
        acceptedName: job.quote_accepted_name || null,
        /* Open to accept online: what the page's accept form is shown for. */
        acceptable: job.status === 'quoted' && !accepted && !withdrawn && !expired(job) && netPence > 0,
        expired: job.status === 'quoted' && !accepted && expired(job),
        customerName: job.customer_name,
        customerPostcode: job.customer_postcode,
        lines,
        netPence,
        vatBp,
        vatPence,
        totalPence: netPence + vatPence
      }
    });
  } catch (err) {
    console.error('quote view failed:', err.message);
    json(res, 500, { ok: false, error: 'quote_failed' });
  }
}
