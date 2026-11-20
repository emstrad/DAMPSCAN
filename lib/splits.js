/**
 * What each person earns on a job.
 *
 * Integer pence throughout. A penny is the unit money actually arrives in, and
 * floating point cannot hold 0.15 exactly, so a chain of percentage steps in
 * floats drifts away from what anyone was really paid. Everything here is whole
 * pence in and whole pence out.
 *
 * The survey waterfall:
 *   1. the price
 *   2. less the tax set aside
 *   3. less the lead fee, taken on the POST-tax figure   -> the lead earner
 *   4. less the surveyor fee                             -> whoever surveyed it
 *   5. the remainder, split 50/50                        -> the two partners
 *
 * Shares (the owners, 19 Nov 2026, from the go-live on 15 Nov): no lead fee;
 * after tax and the surveyor fee the rest goes Scott 40, Tom 40, Ben 20. A job
 * carrying shares (jobs.shares, basis points per person adding to 100%) uses
 * them in place of steps 3 and 5; one without keeps the waterfall above, so
 * the Revolut book reads exactly as it was paid.
 *
 * The lead fee is charged on the post-tax figure, not the headline price. On a
 * 215 pound survey that is 25.80 rather than 32.25, which moves the partners by
 * 3.22 each, so it is worth being explicit about.
 *
 * Remedial work is deliberately simpler: tax off, then the lead fee, and the
 * partners settle materials and labour between themselves offline. On the new
 * split there is no referral fee: the after-tax remedial goes by the shares too. The balance
 * is reported rather than distributed, so it is visible and nobody wonders
 * where it went.
 */

export const PEOPLE = ['scott', 'tom', 'ben'];

/* Who may survey a damp job: the three partners and Ronnie, who surveys for
   ATi and DampScan on the rate card's fee and is not a partner. He takes no
   lead fee and no share, so he is not in PEOPLE (which the rate settings and
   the bank splits are validated against) and his pay is the surveyor fee
   alone, which jobs.surveyor_fee_pence already holds. No pay column needed. */
export const SURVEYORS = [...PEOPLE, 'ronnie'];

/** Defaults. Live values come from job_settings, which the dashboard can edit. */
export const DEFAULTS = {
  taxBp: 2000, // 20.00%
  leadBp: 1500, // 15.00%
  leadEarner: 'scott',
  partners: ['tom', 'ben']
};

/** Basis points of an amount, rounded to the nearest penny, halves away from zero. */
export function bpOf(pence, bp) {
  const exact = (pence * bp) / 10000;
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}

/**
 * Split in two. The odd penny goes to the first partner, in whichever direction
 * the amount points, so the two shares always add back to exactly the total
 * rather than leaving a penny stranded.
 */
export function halve(pence) {
  const second = Math.trunc(pence / 2);
  return [pence - second, second];
}

/** Shares as {scott, tom, ben} basis points adding to exactly 100%, or null. */
export function cleanShares(shares) {
  if (!shares || typeof shares !== 'object') return null;
  const out = {};
  let total = 0;
  for (const p of PEOPLE) {
    const n = Number(shares[p] || 0);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return null;
    out[p] = n;
    total += n;
  }
  return total === 10000 ? out : null;
}

/** An amount split by shares; the odd pennies go to the largest share, so it adds back exactly. */
export function splitBy(pence, shares) {
  const out = {};
  let given = 0;
  for (const p of PEOPLE) { out[p] = bpOf(pence, shares[p]); given += out[p]; }
  const top = PEOPLE.reduce((a, b) => (shares[b] > shares[a] ? b : a));
  out[top] += pence - given;
  return out;
}

function whole(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * @param {object} job
 * @param {number} job.surveyPence        what the customer pays for the survey
 * @param {number} job.surveyorFeePence   the fixed fee for doing the survey
 * @param {string} job.surveyor           who surveyed it, one of SURVEYORS
 * @param {number} [job.remedialPence]    remedial works value, 0 if none
 * @param {number} [job.taxBp]            tax set aside, basis points
 * @param {number} [job.leadBp]           lead fee, basis points
 * @param {string} [job.leadEarner]       who the lead fee goes to
 * @param {string[]} [job.partners]       the two who split the remainder
 * @param {object} [job.shares]           {scott, tom, ben} basis points: no lead fee, the rest by these
 */
export function calcJob(job) {
  const taxBp = job.taxBp == null ? DEFAULTS.taxBp : whole(job.taxBp);
  const leadBp = job.leadBp == null ? DEFAULTS.leadBp : whole(job.leadBp);
  const leadEarner = job.leadEarner || DEFAULTS.leadEarner;
  const partners = job.partners && job.partners.length === 2 ? job.partners : DEFAULTS.partners;

  const surveyPence = whole(job.surveyPence);
  const surveyorFeePence = whole(job.surveyorFeePence);
  const remedialPence = whole(job.remedialPence);

  // Survey
  const surveyTax = bpOf(surveyPence, taxBp);
  const surveyAfterTax = surveyPence - surveyTax;
  const shares = cleanShares(job.shares);
  const surveyLead = shares ? 0 : bpOf(surveyAfterTax, leadBp);
  const remainder = surveyAfterTax - surveyLead - surveyorFeePence;
  const [partnerA, partnerB] = shares ? [0, 0] : halve(remainder);
  const byShare = shares ? splitBy(remainder, shares) : null;

  // Remedial
  const remedialTax = bpOf(remedialPence, taxBp);
  const remedialAfterTax = remedialPence - remedialTax;
  /* On the new split (the owner, 20 Nov 2026: "same split for remedial, no referral fee") the whole
     after-tax remedial goes by the shares; on the old waterfall the lead fee comes off and the rest is settled offline. */
  const remedialLead = shares ? 0 : bpOf(remedialAfterTax, leadBp);
  const remedialShare = shares ? splitBy(remedialAfterTax, shares) : null;
  const remedialOffline = shares ? 0 : remedialAfterTax - remedialLead;

  const pay = {};
  for (const person of PEOPLE) pay[person] = 0;
  pay[leadEarner] = (pay[leadEarner] || 0) + surveyLead + remedialLead;
  if (job.surveyor) pay[job.surveyor] = (pay[job.surveyor] || 0) + surveyorFeePence;
  if (byShare) for (const p of PEOPLE) pay[p] += byShare[p] + (remedialShare ? remedialShare[p] : 0);
  else {
    pay[partners[0]] = (pay[partners[0]] || 0) + partnerA;
    pay[partners[1]] = (pay[partners[1]] || 0) + partnerB;
  }

  return {
    survey: {
      price: surveyPence,
      tax: surveyTax,
      afterTax: surveyAfterTax,
      lead: surveyLead,
      surveyorFee: surveyorFeePence,
      remainder,
      perPartner: [partnerA, partnerB],
      byShare
    },
    remedial: {
      value: remedialPence,
      tax: remedialTax,
      afterTax: remedialAfterTax,
      lead: remedialLead,
      byShare: remedialShare,
      // Not paid out here. The partners settle materials and labour offline.
      settledOffline: remedialOffline
    },
    pay,
    // Everything this job actually distributes. The remedial balance is not in
    // it, by design, so this is the figure the three payouts must add up to.
    distributed: surveyAfterTax + remedialLead + (remedialShare ? remedialAfterTax : 0),
    rates: { taxBp, leadBp, leadEarner, partners, shares }
  };
}
