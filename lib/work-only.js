/**
 * A person who only works on businesses (every grant 'work', not an admin),
 * such as a surveyor, looks and does not change: they see every job in their
 * businesses (with lib/figures.js taking out the money and other people's
 * contacts) and the one thing they record is the survey itself: "Surveyed"
 * and "Report sent". Everything else, a payment tick, a date, a note, a new
 * job, a closed enquiry, is for whoever manages the business, and the server
 * refuses it here whatever the screen showed.
 *
 * Decided per person rather than per business: today nobody mixes 'work' on
 * one business with 'manage' on another, and somebody who manages anything
 * is trusted with the screens as they are.
 */

export const REFUSED = 'You can see the work and mark a survey done or its report sent. Anything else (payments, dates, notes, jobs, enquiries) is for whoever manages the business.';

/** Every grant 'work' (or 'view'), no admin: read only, bar the survey steps. */
export function workOnly(scope) {
  return Boolean(scope && !scope.isAdmin && scope.personId != null && (scope.businesses || []).length
    && !(scope.businesses || []).some((s) => (scope.levels || {})[s] === 'manage'));
}

/* Staff routes whose writes are not the business's work: a phone subscribing
   to alerts, the page-view count, and the assistant's own sign-in and calls
   (whose tools are gated by name below). */
const NOT_WORK = ['push', 'usage', 'mcp', 'oauth'];

/**
 * Whether a work-only person may make this write. The survey board moves a
 * card to Surveyed or Sent (and back a step from either, which is how its
 * Undo of those two works); a tick is the report only; the client card and
 * Today's "Report sent" button send nothing but surveySent.
 */
export function allowedWrite(action, method, body = {}) {
  if (NOT_WORK.includes(action)) return true;
  if (method !== 'POST' || !body || typeof body !== 'object') return false;
  if (action === 'surveys') {
    if (body.op === 'move') return ['surveyed', 'sent', 'booked'].includes(body.to);
    if (body.op === 'tick') return body.what === 'report';
    return false;
  }
  /* Ronnie sets his own hours; the route keeps him to his own. */
  if (action === 'hours') return ['add', 'remove', 'usual', 'bulk', 'remove_window', 'set_usual', 'learn'].includes(body.op);
  if (action === 'clients') return Object.keys(body).every((k) => ['id', 'surveySent', 'reportUpload', 'reportPath', 'reportName'].includes(k));
  return false;
}

/* The assistant's writes a work-only person keeps. */
const WRITE_TOOLS = ['mark_report_sent', 'mark_surveyed', 'attach_report'];

/** Whether a tool is one this person may call: any read, or a survey step. */
export function toolAllowed(scope, tool) {
  if (!workOnly(scope)) return true;
  return Boolean(tool && ((tool.annotations && tool.annotations.readOnlyHint) || WRITE_TOOLS.includes(tool.name)));
}
