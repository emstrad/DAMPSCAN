/**
 * Buttons on a phone alert that make a change without opening the staff
 * area: "Report sent", "Paid in full", "Deposit paid". ntfy posts to the
 * button's address, which carries a signed ticket for one job and one change
 * that runs out after three days, so the address is useless for anything
 * else and soon useless altogether. The change runs through the client card's
 * own route, so it is checked and audited as a tap there would be, under the
 * owners' name.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { staffBase } from './alert-words.js';

export const QUICK = { report: { label: 'Report sent', body: { surveySent: true } }, paid: { label: 'Paid in full', body: { paid: true } }, deposit: { label: 'Deposit paid', body: { depositPaid: true } } };
const LIFE_S = 3 * 86400;

/* No secret, or a guessable one, would let anyone forge a ticket: make none and accept none. */
const secret = () => { const v = process.env.SESSION_SECRET; return v && v.length >= 16 ? v : null; };
const sign = (id, act, exp) => createHmac('sha256', secret()).update(`quick:${id}:${act}:${exp}`).digest('hex');

/** ntfy action buttons for a job: each change asked for, then "Open". */
export function quickButtons(id, acts, path, now = Date.now()) {
  const origin = staffBase().replace(/\/staff$/, '');
  const exp = Math.floor(now / 1000) + LIFE_S;
  const out = (secret() ? acts : []).filter((a) => QUICK[a]).slice(0, 2).map((a) => ({
    action: 'http', label: QUICK[a].label, method: 'POST', clear: true,
    url: `${origin}/api/admin/quick?job=${id}&do=${a}&exp=${exp}&sig=${sign(id, a, exp)}`
  }));
  if (path) out.push({ action: 'view', label: 'Open', url: path });
  return out;
}

/** The change a ticket allows, or null. */
export function readTicket(params, now = Date.now()) {
  const id = params.get('job'); const act = params.get('do'); const exp = params.get('exp'); const sig = String(params.get('sig') || '');
  if (!secret() || !/^\d+$/.test(id || '') || !QUICK[act] || !/^\d+$/.test(exp || '') || Number(exp) < now / 1000) return null;
  const want = Buffer.from(sign(Number(id), act, Number(exp)));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { id: Number(id), act, body: { id: Number(id), ...QUICK[act].body } };
}
