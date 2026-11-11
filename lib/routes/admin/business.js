/**
 * /api/admin/business?site=
 *
 *   GET    the business's VAT setting and invoice details, and its work done
 *          over the last twelve months against the VAT registration threshold
 *   POST   {site, vatRegistered, vatNumber, tradingAddress, companyNumber, paymentDetails}
 *
 * Managers and admins only, both ways: this decides whether customers are
 * charged VAT, so it is not a setting for everybody who can see the jobs.
 * Switch VAT on on the day registration takes effect. From then every open
 * quote and every new invoice carries it; an invoice already issued keeps
 * what it said.
 */
import { queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { payOnline, connectWebhook } from '../../revolut-pay.js';
import { requireScope } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { record } from '../../audit.js';
import { TODAY } from '../../today.js';
import { VAT_THRESHOLD_PENCE } from '../../business-details.js';

export const config = { runtime: 'nodejs' };

const COLUMNS = 'slug, name, payout_model, vat_registered, vat_number, trading_address, company_number, payment_details';
const present = (b) => ({
  site: b.slug, name: b.name, vatRegistered: Boolean(b.vat_registered), vatNumber: b.vat_number, tradingAddress: b.trading_address,
  companyNumber: b.company_number, paymentDetails: b.payment_details
});

/* Work finished in the last twelve months, at the price agreed: the nearest
   figure the system holds to HMRC's taxable turnover for the threshold test. */
async function turnover(site) {
  const r = await queryOne(
    `select coalesce(sum(case when b.payout_model = 'damp' then j.survey_price_pence + j.remedial_pence else j.invoice_net_pence end), 0) as total
       from jobs j join businesses b on b.slug = j.site
      where j.site = $1 and j.status in ('completed', 'paid') and j.job_date > ${TODAY} - interval '12 months'`, [site]);
  return { last12Pence: Number(r.total) || 0, thresholdPence: VAT_THRESHOLD_PENCE };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    /* Online payments (lib/revolut-pay.js), owners only: is it set up, and connect Revolut's notices. */
    const q = new URL(req.url, 'http://x').searchParams;
    if (q.get('view') === 'payments' || body.op === 'revolut-connect') {
      if (!scope.isAdmin) return json(res, 403, { ok: false, error: 'forbidden' });
      if (body.op === 'revolut-connect') {
        if (!payOnline()) return json(res, 400, { ok: false, error: 'Add REVOLUT_MERCHANT_KEY in Vercel first.' });
        try { await connectWebhook(`${process.env.STATUS_BASE || 'https://dampscan.co.uk'}/api/quote?doc=revolut`); } catch (err) { return json(res, 502, { ok: false, error: err.message }); }
      }
      const hook = await queryOne("select updated_at from integration_keys where name = 'revolut_webhook_secret'");
      return json(res, 200, { ok: true, key: payOnline(), connected: hook ? hook.updated_at : null, sandbox: process.env.REVOLUT_SANDBOX === 'on' });
    }
    const site = normaliseSite(req.method === 'POST' ? body.site : new URL(req.url, 'http://x').searchParams.get('site'));
    if (!site || !scope.businesses.includes(site) || !(scope.isAdmin || scope.levels[site] === 'manage')) return json(res, 403, { ok: false, error: 'forbidden' });
    const before = await queryOne(`select ${COLUMNS} from businesses where slug = $1`, [site]);
    if (!before) return json(res, 404, { ok: false, error: 'not_found' });
    if (req.method === 'GET') return json(res, 200, { ok: true, business: present(before), turnover: await turnover(site) });

    const vatRegistered = body.vatRegistered === true;
    const vatNumber = str(body.vatNumber, 20) ? str(body.vatNumber, 20).toUpperCase().replace(/\s+/g, '') : null;
    if (vatNumber && !/^(GB)?(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/.test(vatNumber)) {
      return json(res, 400, { ok: false, errors: { vatNumber: 'A UK VAT number is GB followed by 9 digits.' } });
    }
    if (vatRegistered && !vatNumber) return json(res, 400, { ok: false, errors: { vatNumber: 'Add the VAT number to switch VAT on.' } });
    const after = await queryOne(
      `update businesses set vat_registered = $2, vat_number = $3, trading_address = $4, company_number = $5, payment_details = $6
        where slug = $1 returning ${COLUMNS}`,
      [site, vatRegistered, vatNumber, str(body.tradingAddress, 300) || null, str(body.companyNumber, 20) || null, str(body.paymentDetails, 300) || null]);
    await record({ scope, business: site, entity: 'business', entityId: null, action: 'business_details', before: present(before), after: present(after) });
    return json(res, 200, { ok: true, business: present(after), turnover: await turnover(site) });
  } catch (err) {
    console.error('business request failed:', err.message);
    json(res, 500, { ok: false, error: 'business_failed' });
  }
}
