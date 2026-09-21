/**
 * What Scott earns on a roofing job, and what the company keeps.
 *
 * Scott is not an owner of the roofing company. He runs the lead side and is
 * paid a finder's fee; the owners are paid a day rate for days they physically
 * worked; whatever is left stays in the company. The formula, as agreed:
 *
 *   direct_total = every cost line on the job (materials, scaffold, skip, ...)
 *   balance      = invoice_net - direct_total
 *   reserve      = balance x 19%        set aside for Corporation Tax
 *   fee_base     = balance - reserve
 *   scott_fee    = max(50 pounds, 5% of fee_base)
 *   wages        = sum over working owners of days x day_rate
 *   retained     = fee_base - scott_fee - wages      may be negative
 *
 * Two things in that are deliberate and worth stating so nobody "fixes" them:
 *
 * The fee is a floor, not a cut-off. Fifty pounds under a thousand and five
 * percent at or above it, which is how the agreement was first written, paid
 * less on a 2,000 pound job than on a 999 pound one, because five percent of
 * the net-of-costs figure does not reach fifty until that figure passes
 * 1,234.57. max(50, 5%) removes the band and leaves every worked example in
 * the agreement unchanged.
 *
 * The fee is never reduced by a loss. On the agreement's own example, a 10,000
 * pound re-roof loses 287.25 after three owners' wages and Scott still takes
 * his 182.25. The air conditioning engine floors profit at zero for its split;
 * this one does not, and the two must not be made to match.
 *
 * The reserve is floored at zero. A job whose costs exceed its invoice has no
 * profit to reserve tax against, and a negative accrual into the tax ledger is
 * not a thing.
 *
 * Integer pence throughout, rounding shared with lib/splits.js so there is one
 * rounding rule in the codebase and not two that disagree by a penny.
 */
import { bpOf } from '../splits.js';

export const DEFAULTS = {
  reserveBp: 1900,     // 19.00%
  feeBp: 500,          // 5.00%
  feeFloorPence: 5000  // 50 pounds
};

const whole = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * @param {object} job
 * @param {number}   job.invoiceNetPence   what the customer is invoiced, net of VAT
 * @param {Array<{label:string, amountPence:number}>} [job.costs]  every direct cost line
 * @param {Array<{personId:number, days:number, dayRatePence:number}>} [job.ownerDays]
 * @param {number}   [job.reserveBp]       stored on the job at creation
 * @param {number}   [job.feeBp]
 * @param {number}   [job.feeFloorPence]
 */
export function roofingPayout(job) {
  const reserveBp = job.reserveBp == null ? DEFAULTS.reserveBp : whole(job.reserveBp);
  const feeBp = job.feeBp == null ? DEFAULTS.feeBp : whole(job.feeBp);
  const feeFloorPence = job.feeFloorPence == null ? DEFAULTS.feeFloorPence : whole(job.feeFloorPence);

  const invoiceNet = whole(job.invoiceNetPence);
  const costs = (job.costs || []).map((c) => ({ label: String(c.label || ''), amountPence: whole(c.amountPence) }));
  const directTotal = costs.reduce((sum, c) => sum + c.amountPence, 0);

  const balance = invoiceNet - directTotal;
  const reserve = Math.max(0, bpOf(balance, reserveBp));
  const feeBase = balance - reserve;
  const feePercent = bpOf(feeBase, feeBp);
  const scottFee = Math.max(feeFloorPence, feePercent);

  const ownerDays = (job.ownerDays || []).map((d) => {
    const days = Number(d.days) || 0;
    const rate = whole(d.dayRatePence);
    return { personId: d.personId, days, dayRatePence: rate, wagePence: Math.round(days * rate) };
  });
  const wages = ownerDays.reduce((sum, d) => sum + d.wagePence, 0);

  const retained = feeBase - scottFee - wages;

  return {
    model: 'roofing',
    invoiceNet,
    costs,
    directTotal,
    balance,
    reserve,
    feeBase,
    /* Shown separately so the working screen can say "5% would be 32.40, the
       floor is 50.00, you are paid 50.00" rather than one number. */
    feePercent,
    feeFloorPence,
    scottFee,
    floorApplied: scottFee > feePercent,
    ownerDays,
    wages,
    retained,
    lossMaking: retained < 0,
    rates: { reserveBp, feeBp, feeFloorPence }
  };
}
