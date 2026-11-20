/**
 * When the company's own money starts (the owner, 20 Nov 2026: Overview and
 * Money still counted the Revolut money from before the company). Damp
 * Surveying Limited was incorporated on 10 November 2026 and its year ends on
 * 30 November, so its first year runs 10 Nov 2026 to 30 Nov 2027 and every
 * year after from 1 December. The company's money is the new book (Tide and
 * Stripe, lib/pay-book.js); the Revolut book before it is the business before
 * the company, shown apart and never in the company's profit, tax or VAT.
 */
export const COMPANY_START = '2026-11-10';
const FIRST_END = '2027-11-30';

/** The company year a London day falls in, as { from, to }. */
export function companyYear(today) {
  if (today <= FIRST_END) return { from: COMPANY_START, to: FIRST_END };
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const start = m === 12 ? y : y - 1;
  return { from: `${start}-12-01`, to: `${start + 1}-11-30` };
}

/** A day no earlier than the company's start: figures before it are the business before the company. */
export const fromStart = (day) => (!day || day < COMPANY_START ? COMPANY_START : day);
