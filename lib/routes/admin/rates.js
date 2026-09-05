/**
 * /api/admin/rates
 *
 *   GET   the rate card and the two global percentages
 *   POST  update either
 *
 * Changing a rate affects jobs saved from that point on. Existing jobs carry
 * the rates they were agreed at, so nothing already recorded moves. That is
 * deliberate: an earnings record that changes retrospectively is worthless.
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireAuth } from '../../session.js';
import { PEOPLE } from '../../splits.js';

export const config = { runtime: 'nodejs' };

function pence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded < 0 ? null : rounded;
}

/** Basis points: 2000 is 20.00%. Anything outside 0 to 100% is a typo. */
function basisPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 0 && rounded <= 10000 ? rounded : null;
}

async function read(res) {
  const [rates, settings] = await Promise.all([
    query('select * from job_rates order by position, key'),
    queryOne('select * from job_settings where id = true')
  ]);

  json(res, 200, {
    ok: true,
    rates: rates.map((r) => ({
      key: r.key,
      label: r.label,
      pricePence: r.price_pence,
      surveyorFeePence: r.surveyor_fee_pence,
      position: r.position,
      active: r.active
    })),
    settings: {
      taxBp: settings.tax_bp,
      leadBp: settings.lead_bp,
      leadEarner: settings.lead_earner,
      partners: [settings.partner_a, settings.partner_b]
    }
  });
}

async function write(res, body) {
  const errors = {};

  if (Array.isArray(body.rates)) {
    for (const rate of body.rates) {
      const key = str(rate.key, 60);
      const price = pence(rate.pricePence);
      const fee = pence(rate.surveyorFeePence);
      if (!key) {
        errors.rates = 'Every rate needs a key.';
        break;
      }
      if (price == null || fee == null) {
        errors[key] = 'Price and surveyor fee must both be zero or more.';
        continue;
      }
      await query(
        `insert into job_rates (key, label, price_pence, surveyor_fee_pence, position, active)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (key) do update set
           label = excluded.label,
           price_pence = excluded.price_pence,
           surveyor_fee_pence = excluded.surveyor_fee_pence,
           position = excluded.position,
           active = excluded.active,
           updated_at = now()`,
        [key, str(rate.label, 80) || key, price, fee, Number(rate.position) || 0, rate.active !== false]
      );
    }
  }

  if (body.settings) {
    const taxBp = basisPoints(body.settings.taxBp);
    const leadBp = basisPoints(body.settings.leadBp);
    const leadEarner = str(body.settings.leadEarner, 20);
    const partners = Array.isArray(body.settings.partners) ? body.settings.partners : [];

    if (taxBp == null) errors.taxBp = 'Tax must be between 0 and 100 percent.';
    if (leadBp == null) errors.leadBp = 'Lead fee must be between 0 and 100 percent.';
    if (!PEOPLE.includes(leadEarner)) errors.leadEarner = 'Unknown person.';
    if (partners.length !== 2 || !partners.every((p) => PEOPLE.includes(p)) || partners[0] === partners[1]) {
      errors.partners = 'Pick two different people to split the remainder.';
    }

    if (!Object.keys(errors).length) {
      await query(
        `update job_settings set tax_bp = $1, lead_bp = $2, lead_earner = $3,
                                 partner_a = $4, partner_b = $5, updated_at = now()
          where id = true`,
        [taxBp, leadBp, leadEarner, partners[0], partners[1]]
      );
    }
  }

  if (Object.keys(errors).length) {
    json(res, 400, { ok: false, errors });
    return;
  }
  await read(res);
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') return await read(res);
    return await write(res, await readJson(req));
  } catch (err) {
    console.error('rates request failed:', err.message);
    json(res, 500, { ok: false, error: 'rates_failed' });
  }
}
