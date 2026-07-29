/**
 * FormSubmit notification.
 *
 * Email is a convenience, the database is the source of truth. Every failure
 * path here returns a value rather than throwing, and /api/lead records the
 * outcome on the row and still answers 200.
 */

const TIMEOUT_MS = 6000;

function endpoint() {
  if (process.env.FORMSUBMIT_ENDPOINT) return process.env.FORMSUBMIT_ENDPOINT;
  const to = process.env.NOTIFY_EMAIL;
  return to ? `https://formsubmit.co/ajax/${to}` : null;
}

function subjectFor(lead) {
  const who = lead.firstName || 'unknown';
  const where = lead.postcode || 'no postcode';
  return lead.stage === 'complete'
    ? `NEW survey booking, ${who}, ${where}`
    : `PARTIAL lead (step 1), ${who}, ${where}`;
}

/**
 * Flat, human-readable keys only. FormSubmit renders whatever it is given as a
 * table, so nesting or camelCase would land in Scott's inbox looking like JSON.
 */
export function notificationPayload(lead, id) {
  const payload = {
    _subject: subjectFor(lead),
    _captcha: 'false',
    _template: 'table',
    'First name': lead.firstName || '',
    Email: lead.email || '',
    Phone: lead.phone || 'Not given',
    Postcode: lead.postcode || '',
    Issue: lead.issues?.length ? lead.issues.join(', ') : 'Not given yet',
    'Owner or landlord': lead.role || 'Not given yet',
    'Previous survey': lead.previousSurvey === null ? 'Not asked yet' : lead.previousSurvey ? 'Yes' : 'No',
    Notes: lead.notes || 'None',
    'Lead stage': lead.stage,
    Submitted: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
    'Lead ID': String(id)
  };
  if (lead.utm && Object.keys(lead.utm).length) {
    payload.Campaign = Object.entries(lead.utm).map(([k, v]) => `${k}=${v}`).join(' ');
  }
  return payload;
}

/** Returns { ok: true } or { ok: false, error } and never throws. */
export async function sendLeadNotification(lead, id) {
  const url = endpoint();
  if (!url) return { ok: false, error: 'FORMSUBMIT_ENDPOINT and NOTIFY_EMAIL are both unset' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(notificationPayload(lead, id)),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `FormSubmit ${res.status}: ${body.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : err.message;
    return { ok: false, error: `FormSubmit request failed: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}
