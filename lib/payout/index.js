/**
 * One entry point, three engines, chosen by the business's payout model.
 *
 * Damp keeps the survey waterfall it always had, in lib/splits.js, untouched.
 * Roofing pays a finder's fee on a floor. Air conditioning splits profit in
 * half. They are different agreements between different owners and the only
 * thing they share is the rounding rule. An unknown model throws rather than
 * falling back to any of them, because being paid under the wrong agreement
 * is the one outcome this file exists to prevent.
 */
import { calcJob } from '../splits.js';
import { roofingPayout } from './roofing.js';
import { acPayout } from './ac.js';

const ENGINES = {
  damp: calcJob,
  roofing: roofingPayout,
  ac: acPayout
};

export const MODELS = Object.keys(ENGINES);

export function payoutFor(model, job) {
  const engine = ENGINES[model];
  if (!engine) throw new Error(`no payout engine for model "${model}"`);
  return engine(job);
}

export { roofingPayout, acPayout };
