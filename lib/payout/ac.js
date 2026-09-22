/**
 * What Scott and Tom each earn on an air conditioning job.
 *
 * Two owners, one job, half each of what is left, as agreed:
 *
 *   profit         = invoice_net - every cost line (units, labour, extras)
 *   payout_profit  = max(0, profit)
 *   scott          = 50% of payout_profit
 *   tom            = payout_profit - scott
 *
 * The partner's share is subtraction, not a second percentage. On an odd
 * profit of 10.01 that gives 5.01 and 5.00, and the two always add back to the
 * profit exactly. Two rounded halves would create or lose a penny.
 *
 * Profit floors at zero for the payout and the true figure is kept beside it.
 * Nobody is paid on a loss, and a run of loss making installs must not read
 * as break even, which is what happens if the loss is simply hidden. The
 * roofing engine does the opposite, paying its fee on a loss; the two are
 * different agreements and must not be unified.
 *
 * No ad spend, no van, no tools, no "money into the business": costs are
 * what this job cost, and the list of them is the job's own cost lines.
 */
import { bpOf } from '../splits.js';

export const DEFAULTS = {
  splitBp: 5000  // 50.00% to the first party, remainder to the second
};

const whole = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * @param {object} job
 * @param {number} job.invoiceNetPence
 * @param {Array<{label:string, amountPence:number}>} [job.costs]
 * @param {number} [job.splitBp]   stored on the job at creation
 * @param {[string,string]} [job.partners]   names for the two shares, first gets the split
 */
export function acPayout(job) {
  const splitBp = job.splitBp == null ? DEFAULTS.splitBp : whole(job.splitBp);
  const partners = job.partners && job.partners.length === 2 ? job.partners : ['scott', 'tom'];

  const invoiceNet = whole(job.invoiceNetPence);
  const costs = (job.costs || []).map((c) => ({ label: String(c.label || ''), amountPence: whole(c.amountPence) }));
  const costTotal = costs.reduce((sum, c) => sum + c.amountPence, 0);

  const profit = invoiceNet - costTotal;
  const payoutProfit = Math.max(0, profit);
  const first = bpOf(payoutProfit, splitBp);
  const second = payoutProfit - first;

  return {
    model: 'ac',
    invoiceNet,
    costs,
    costTotal,
    profit,
    payoutProfit,
    lossMaking: profit < 0,
    pay: { [partners[0]]: first, [partners[1]]: second },
    partners,
    rates: { splitBp }
  };
}
