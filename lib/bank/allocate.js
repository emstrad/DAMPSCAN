/**
 * Splitting one bank line between people.
 *
 * A spend can be shared by any of the people a set of books names, or belong
 * to its tax pot (a payment to HMRC), and the chosen set gets equal shares.
 * Whole pence throughout, for the reason lib/splits.js gives: a penny is the
 * unit money arrives in, and a chain of float divisions drifts away from it.
 *
 * Amounts are signed. Money out is negative and so are its shares, which is
 * what reduces a person's balance; a refund or a partner putting money in is
 * positive and adds to one. The same function handles both, and the shares
 * always add back to exactly the amount, whichever way it points.
 *
 * The targets default to damp's four, which is what the damp books have always
 * used. Every other set of books passes its own, in its own order, and the
 * order is what decides where an odd penny lands.
 */

/** Damp's targets, in this order, so the odd penny always lands in the same place. */
export const TARGETS = ['scott', 'tom', 'ben', 'tax'];

const NAMES = { scott: 'Scott', tom: 'Tom', ben: 'Ben', tax: 'Tax' };

/**
 * A list of targets from a request body, de-duplicated and in canonical order.
 * An empty list is a real value, "not split yet". Anything not a target at all
 * is refused with null rather than silently dropped, so a typo cannot quietly
 * move money to fewer people than were asked for.
 */
export function normaliseSplit(value, targets = TARGETS) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[+,\s]+/);
  const out = [];
  for (const raw of list) {
    const key = String(raw).trim().toLowerCase();
    if (!key) continue;
    if (!targets.includes(key)) return null;
    if (!out.includes(key)) out.push(key);
  }
  return targets.filter((t) => out.includes(t));
}

/**
 * Equal shares of `amountPence` across `split`, as a map over every target.
 * The remainder that does not divide is handed out a penny at a time to the
 * earliest targets, in the direction the amount points, so -1000 across three
 * people is -334, -333, -333 and never a stranded penny.
 */
export function shares(amountPence, split, targets = TARGETS) {
  const out = {};
  for (const t of targets) out[t] = 0;
  const amount = Math.round(Number(amountPence) || 0);
  if (!split || !split.length) return out;

  const n = split.length;
  const base = Math.trunc(amount / n);
  let left = amount - base * n;
  const step = left < 0 ? -1 : 1;

  for (const target of split) {
    out[target] = base;
    if (left !== 0) {
      out[target] += step;
      left -= step;
    }
  }
  return out;
}

/** "Scott + Tom", "Everyone", "Tax", or "Not split". */
export function splitLabel(split, names = NAMES) {
  if (!split || !split.length) return 'Not split';
  const people = split.filter((t) => t !== 'tax');
  if (people.length === 3 && split.length === 3 && names === NAMES) return 'Everyone';
  return split.map((t) => names[t] || t).join(' + ');
}
