/**
 * Damp Surveying Limited's own details (the owners' plan, 11 Nov 2026), kept
 * in Settings for the owners and ChatGPT to read: company number, registered
 * office, directors, HMRC references, the Government Gateway user ID, year
 * end and filing dates, bank and insurance. Receipts on the customer's page
 * use the name, number, office and VAT number.
 *
 * Never a password, PIN, passcode or security answer: those stay in the
 * owners' password manager. The fields are fixed (nothing free-named), and
 * anything that reads like a secret is refused.
 */
import { query } from './db.js';

export const FIELDS = [
  ['legal_name', 'Company name'], ['company_number', 'Company number'], ['registered_office', 'Registered office'],
  ['incorporated_on', 'Incorporated on'], ['directors', 'Directors'], ['sic_code', 'SIC code'],
  ['vat_status', 'VAT status'], ['vat_number', 'VAT number'], ['utr', 'Corporation Tax UTR'],
  ['paye_ref', 'PAYE reference'], ['accounts_office_ref', 'Accounts Office reference'], ['gateway_user_id', 'Government Gateway user ID'],
  ['year_end', 'Year end'], ['accounts_due', 'Accounts due'], ['confirmation_due', 'Confirmation statement due'],
  ['bank', 'Bank (name, sort code, account number)'], ['insurer', 'Insurer and policy'], ['insurance_renewal', 'Insurance renews'],
  ['ico_number', 'ICO registration'], ['accountant', 'Accountant'], ['notes', 'Notes']
];
const KEYS = new Set(FIELDS.map(([k]) => k));
export const DEFAULTS = { legal_name: 'Damp Surveying Limited' };
/* Words that mean a secret is being typed in. */
const SECRET = /\b(pass ?words?|pass ?codes?|pins?|security (answers?|codes?|questions?)|memorable|one[- ]time code|otp)\b\s*[:=]?/i;

export async function readCompany() {
  const rows = await query('select key, value, updated_at, updated_by from company_details');
  const got = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    fields: FIELDS.map(([key, label]) => ({ key, label, value: got[key] ?? DEFAULTS[key] ?? '' })),
    updatedAt: rows.reduce((a, r) => (!a || r.updated_at > a ? r.updated_at : a), null)
  };
}

/** Saves the given fields. Returns { errors } when one reads like a secret. */
export async function saveCompany(values, by) {
  const errors = {};
  const keep = [];
  for (const [key, raw] of Object.entries(values || {})) {
    if (!KEYS.has(key)) continue;
    const value = String(raw ?? '').trim().slice(0, 600);
    if (SECRET.test(value)) { errors[key] = 'No passwords, PINs or security answers here: keep those in your password manager.'; continue; }
    keep.push([key, value]);
  }
  if (Object.keys(errors).length) return { errors };
  for (const [key, value] of keep) {
    if (!value) await query('delete from company_details where key = $1', [key]);
    else await query(`insert into company_details (key, value, updated_by) values ($1, $2, $3)
        on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [key, value, by || null]);
  }
  return readCompany();
}

/** The few facts a receipt carries. */
export async function receiptCompany() {
  const { fields } = await readCompany();
  const v = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  return { name: v.legal_name || 'Damp Surveying Limited', number: v.company_number || null, office: v.registered_office || null, vatNumber: v.vat_number || null };
}
