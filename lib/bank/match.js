/**
 * Which job a payment is for.
 *
 * A customer's transfer arrives with a name, sometimes a reference, and an
 * amount, and the job it belongs to has a name, a postcode, a price and a date.
 * Each pairing is scored on how many of those agree. The importer matches by
 * itself only when one job clearly wins; anything closer than that is offered
 * as a suggestion for a person to confirm, because a wrong match marks the
 * wrong customer as paid, and that is worse than an unmatched line.
 *
 * Only money in is ever matched. A refund to a customer is a split, not a job.
 */

const DAY = 86400000;
/* Amount alone, or a name inside a fortnight, is enough to match when nothing
   else is close: every line is reviewed anyway, so the importer does as much
   as it can and a wrong guess is one click to undo. A tie still waits. */
const AUTO_THRESHOLD = 3;

/* Deposits are taken well before the visit and the balance can arrive well
   after it, so the window is wide. Outside it a job is not a candidate at all. */
const BEFORE_DAYS = 60;
const AFTER_DAYS = 180;

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function tokens(name) {
  return String(name || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / DAY);
}

/**
 * @param {object} tx    {postedOn, amountPence, description, reference, counterparty}
 * @param {object} job   {id, jobDate, customerName, firstName, postcode, surveyPricePence,
 *                        remedialPence, receivedPence}
 * @returns {number|null} the score, or null when the job is not a candidate
 */
export function scoreJob(tx, job) {
  if (!(tx.amountPence > 0) || !job.jobDate) return null;
  const days = daysBetween(tx.postedOn, job.jobDate);
  if (days < -BEFORE_DAYS || days > AFTER_DAYS) return null;

  const price = Number(job.surveyPricePence) || 0;
  const remedial = Number(job.remedialPence) || 0;
  const received = Number(job.receivedPence) || 0;
  const deposit = Math.ceil(price / 2);
  const amount = tx.amountPence;

  let score = 0;
  if (price > 0 && [price, deposit, price - deposit, price - received].includes(amount)) score += 3;
  else if ((remedial > 0 && amount === remedial) || (remedial > 0 && amount === price + remedial)) score += 2;

  const hay = [tx.counterparty, tx.reference, tx.description].filter(Boolean).join(' ').toLowerCase();
  const names = new Set([...tokens(job.customerName), ...tokens(job.firstName)]);
  if ([...names].some((t) => new RegExp(`\\b${t}\\b`).test(hay))) score += 2;

  const postcode = squash(job.postcode);
  if (postcode.length >= 5 && squash(hay).includes(postcode)) score += 3;

  if (Math.abs(days) <= 14) score += 1;
  return score > 0 ? score : null;
}

/** Candidate jobs for a line, best first. */
export function suggest(tx, jobs, limit = 3) {
  const scored = [];
  for (const job of jobs) {
    const score = scoreJob(tx, job);
    if (score !== null) scored.push({ jobId: job.id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.jobId - b.jobId);
  return scored.slice(0, limit);
}

/**
 * The job to match without asking, or null. One candidate has to reach the
 * threshold and beat the runner-up outright; a tie is a question for a
 * person, however high the scores, because two customers with the same price
 * in the same fortnight is exactly when a guess marks the wrong one paid.
 */
export function autoMatch(tx, jobs) {
  const [best, next] = suggest(tx, jobs, 2);
  if (!best || best.score < AUTO_THRESHOLD) return null;
  if (next && next.score >= best.score) return null;
  return best.jobId;
}
