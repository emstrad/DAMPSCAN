/**
 * Server-side lead validation and normalisation.
 *
 * The client validates too, but nothing here trusts it. Error strings match the
 * static copy already sitting in index.html, so when a 400 comes back the field
 * message the visitor sees is the one that was always going to be there.
 */

export const STAGES = ['partial', 'complete'];

export const ISSUES = [
  'Damp',
  'Mould',
  'Timber / Woodworm',
  'Leak / Water damage',
  'Cold / condensation',
  'Not sure'
];

export const ROLES = [
  'Homeowner',
  'Landlord',
  'Letting agent / managing agent',
  'Tenant',
  'Buying the property'
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * UK postcode, outward then inward. Deliberately permissive on spacing and case
 * because visitors type it every possible way.
 */
const POSTCODE_RE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function normalisePostcode(value) {
  const match = POSTCODE_RE.exec(String(value || '').trim().replace(/\s+/g, ' '));
  if (!match) return null;
  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

export function normalisePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, value: null };
  if (raw.replace(/\D/g, '').length < 9) return { ok: false, value: null };
  return { ok: true, value: raw.slice(0, 40) };
}

function text(value, max) {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : '';
}

/**
 * Returns { ok, errors, value }.
 *
 * `errors` is keyed by the client-side field name so index.html can map each one
 * onto its existing .form-row. `value` is the normalised row ready for insert.
 */
export function validateLead(body) {
  const errors = {};

  const stage = STAGES.includes(body.stage) ? body.stage : null;
  if (!stage) errors.stage = 'Unknown submission stage.';

  const sessionId = String(body.sessionId || '').trim();
  if (!UUID_RE.test(sessionId)) errors.sessionId = 'Missing or malformed session id.';

  const firstName = text(body.firstName, 80);
  if (!firstName) errors.firstName = 'Please enter your first name.';

  const email = text(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';

  const postcode = normalisePostcode(body.postcode);
  if (!postcode) errors.postcode = 'Please enter your postcode.';

  const phone = normalisePhone(body.phone);
  if (!phone.ok) errors.phone = 'Please enter a valid phone number, or leave it blank.';

  const rawIssues = Array.isArray(body.issues) ? body.issues : [];
  const issues = [...new Set(rawIssues.map((i) => text(i, 60)))].filter((i) => ISSUES.includes(i));
  if (issues.length !== rawIssues.length) errors.issues = 'Pick at least one, "Not sure" is fine.';

  let role = null;
  if (body.role !== undefined && body.role !== null && text(body.role, 60) !== '') {
    role = text(body.role, 60);
    if (!ROLES.includes(role)) {
      errors.role = 'Please choose one.';
      role = null;
    }
  }

  // Step 3 is where role and issues are collected, so they are only mandatory
  // once the visitor claims to have finished.
  if (stage === 'complete') {
    if (!issues.length) errors.issues = 'Pick at least one, "Not sure" is fine.';
    if (!role) errors.role = 'Please choose one.';
  }

  const previousSurvey =
    body.previousSurvey === undefined || body.previousSurvey === null
      ? null
      : Boolean(body.previousSurvey);

  const value = {
    stage,
    sessionId,
    firstName,
    email,
    postcode,
    phone: phone.value,
    issues,
    role,
    previousSurvey,
    notes: text(body.notes, 4000) || null,
    sourcePath: text(body.sourcePath, 300) || null,
    referrer: text(body.referrer, 500) || null,
    utm: sanitiseUtm(body.utm)
  };

  return { ok: Object.keys(errors).length === 0, errors, value };
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

/** Keeps only recognised campaign parameters, so the jsonb column cannot be used as free storage. */
export function sanitiseUtm(utm) {
  if (!utm || typeof utm !== 'object' || Array.isArray(utm)) return {};
  const out = {};
  for (const key of UTM_KEYS) {
    const raw = utm[key];
    if (raw === undefined || raw === null) continue;
    const clean = String(raw).trim().slice(0, 120);
    if (clean) out[key] = clean;
  }
  return out;
}
