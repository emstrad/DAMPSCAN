import { m365Configured, sendViaM365 } from './m365-email.js';

/**
 * The lead notification email: from the owners' own Microsoft 365 mailbox when
 * that is set up (lib/m365-email.js), otherwise through FormSubmit.
 *
 * Each brand's address and subject wording live here, once. The build writes
 * them into every page for the browser to use, and the lead endpoint uses them
 * to send the same email itself the moment a lead lands. Until now only the
 * visitor's browser sent it, so an email depended on a stranger's tab staying
 * open, their signal holding and their ad blocker allowing it. Now the server
 * sends it first and the browser is the fallback.
 *
 * Keyed by the runtime site key, like lib/enquiry.js. ATi's runtime key is
 * "ati-london" while the build calls it "ati", so the lookup accepts both.
 */
export const LEAD_EMAIL = {
  dampscan: {
    origin: 'https://dampscan.co.uk',
    to: 'tom@atidampsurvey.co.uk',
    subjectPrefix: ''
  },
  'ati-london': {
    origin: 'https://atidampsurvey.co.uk',
    to: 'team@atidampsurvey.co.uk',
    subjectPrefix: 'ATI London, '
  },
  roofing: {
    origin: 'https://vergeroofing.com',
    to: 'team@vergeroofing.com',
    subjectPrefix: 'Verge Roofing, ',
    subjectComplete: 'NEW quote request, ',
    subjectPartial: 'PARTIAL enquiry (step 1), '
  },
  ac: {
    origin: 'https://coolright.co.uk',
    to: 'team@coolright.co.uk',
    subjectPrefix: 'CoolRight, ',
    subjectComplete: 'NEW quote request, ',
    subjectPartial: 'PARTIAL enquiry (step 1), '
  }
};

const ALIAS = { ati: 'ati-london' };

export function leadEmailFor(key) {
  const entry = LEAD_EMAIL[ALIAS[key] || key];
  if (!entry) throw new Error(`no lead email definition for site "${key}"`);
  return entry;
}

export const formSubmitUrl = (key) => `https://formsubmit.co/ajax/${leadEmailFor(key).to}`;

/* The same fields the browser sends, in the same order, so an email reads the
   same whichever side sent it. */
export function leadEmailFields({ site, stage, value, id, now = new Date() }) {
  const cfg = leadEmailFor(site);
  const who = value.firstName || 'unknown';
  const where = value.postcode || 'no postcode';
  const files = value.files || [];
  const fields = {
    _subject: (cfg.subjectPrefix || '')
      + (stage === 'complete'
        ? (cfg.subjectComplete || 'NEW survey booking, ')
        : (cfg.subjectPartial || 'PARTIAL lead (step 1), ')) + who + ', ' + where,
    _captcha: 'false',
    _template: 'table',
    'First name': value.firstName || '',
    Email: value.email || '',
    Phone: value.phone || 'Not given',
    Postcode: value.postcode || '',
    Address: [value.addressLine1, value.town, value.postcode].filter(Boolean).join(', ') || 'Not given yet',
    ...(files.length
      ? Object.fromEntries(files.map((p, i) => [
          'Attachment ' + (i + 1),
          cfg.origin + '/api/admin/attachment?path=' + encodeURIComponent(p)
        ]))
      : { Attachments: 'None' }),
    Issue: (value.issues || []).length ? value.issues.join(', ') : 'Not given yet',
    'Previous survey': stage === 'complete'
      ? (value.previousSurvey ? 'Yes' : 'No')
      : 'Not asked yet',
    Notes: value.notes || 'None',
    'Lead stage': stage,
    Submitted: now.toLocaleString('en-GB', { timeZone: 'Europe/London' }),
    'Lead ID': id ? String(id) : ''
  };
  return fields;
}

/**
 * Sends it. Never throws: resolves { ok: true } or { ok: false, error }.
 *
 * Origin and Referer are the brand's own site, which is where the lead came
 * from. The user agent says plainly what is calling. If FormSubmit's
 * Cloudflare answers with a challenge page instead of JSON, that is recorded
 * as the reason and the browser's own send takes over.
 */
export async function sendLeadEmail({ site, stage, value, id, fetchImpl = globalThis.fetch, timeoutMs = 6000, transport }) {
  let cfg;
  try { cfg = leadEmailFor(site); } catch (err) { return { ok: false, error: err.message }; }
  /* The owners' own mailbox first (lib/m365-email.js); FormSubmit only if that is not set up or fails. */
  let first = null;
  if (m365Configured() || transport) {
    const own = await sendViaM365({ to: cfg.to, fields: leadEmailFields({ site, stage, value, id }), replyTo: value.email, transport });
    if (own.ok) return own;
    first = own.error;
  }
  const viaForm = await sendFormSubmit({ site, stage, value, id, fetchImpl, timeoutMs, cfg });
  return viaForm.ok || !first ? viaForm : { ok: false, error: first + '; then ' + viaForm.error };
}

async function sendFormSubmit({ site, stage, value, id, fetchImpl, timeoutMs, cfg }) {
  const path = value.sourcePath && value.sourcePath.startsWith('/') ? value.sourcePath : '/';
  try {
    const res = await fetchImpl(formSubmitUrl(site), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: cfg.origin,
        Referer: cfg.origin + path,
        'User-Agent': 'LeadNotifier/1.0 (+' + cfg.origin + ')'
      },
      body: new URLSearchParams(leadEmailFields({ site, stage, value, id })).toString(),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* a challenge page, not JSON */ }
    if (body && String(body.success).toLowerCase() === 'true') return { ok: true };
    if (body && body.message) return { ok: false, error: String(body.message).slice(0, 400) };
    return { ok: false, error: `FormSubmit answered HTTP ${res.status} without a result, likely a bot check.` };
  } catch (err) {
    return { ok: false, error: err && err.name === 'TimeoutError'
      ? 'FormSubmit did not answer in time.'
      : String((err && err.message) || err).slice(0, 400) };
  }
}
