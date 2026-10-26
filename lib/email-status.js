/**
 * What happened to a lead's notification email, in words staff can act on.
 *
 * The email is sent by the visitor's browser through FormSubmit, so the only
 * record of it is what that browser managed to report back: confirmed, failed
 * with FormSubmit's or the browser's own message, fired as the page closed and
 * so never confirmed, or nothing at all. The raw messages are browser jargon
 * ("Failed to fetch", "Load failed"), which is why a lead only ever showed
 * "Failed" and nobody could say why. This turns each outcome into a label and
 * a sentence, and keeps the raw text alongside for anyone who wants it.
 *
 * Worked out here rather than in the page so it is tested with everything
 * else, and so the CSV and the table can never disagree.
 */

/* A browser that has not reported yet may simply still be waiting on
   FormSubmit, so a very new lead is "sending" rather than a mystery. */
const SENDING_MS = 2 * 60 * 1000;

const EXPLAIN = [
  [/Microsoft 365:.*(535|auth|SmtpClientAuthentication)/i,
    'Microsoft 365 would not let the site sign in: check the app password, and that SMTP sending is allowed for that mailbox. FormSubmit was tried as well.'],
  [/Microsoft 365:/i,
    'Microsoft 365 did not send it, so FormSubmit was tried as well.'],
  [/failed to fetch|load failed|networkerror|network request failed|err_/i,
    "The visitor's browser could not reach FormSubmit. Usually an ad blocker, a privacy setting or a weak signal."],
  [/preflight|keepalive/i,
    "The visitor's browser would not send it as the page closed."],
  [/activat/i,
    'FormSubmit says this address needs activating. Look for its activation email and click the link.'],
  [/bot check/i,
    "FormSubmit's bot check stopped the server sending it, and the visitor's browser did not report back either."],
  [/did not answer in time/i,
    'FormSubmit did not answer the server in time, and the visitor\'s browser did not report back either.'],
  [/did not confirm/i,
    'FormSubmit answered but did not say it had sent the email.']
];

export function explainError(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'No reason was given.';
  for (const [pattern, sentence] of EXPLAIN) if (pattern.test(text)) return sentence;
  return `FormSubmit said: ${text.replace(/^Server send: /, '')}`;
}

/**
 * row: { notified_at, notify_error, notify_beacon_at, created_at }.
 * Returns { state, label, reason, raw }.
 */
export function emailStatus(row, now = Date.now()) {
  if (row.notified_at) {
    return { state: 'sent', label: 'Sent', reason: 'The email was sent and confirmed.', raw: null };
  }
  if (row.notify_error) {
    return { state: 'failed', label: 'Failed', reason: explainError(row.notify_error), raw: row.notify_error };
  }
  if (row.notify_beacon_at) {
    return {
      state: 'unconfirmed', label: 'Sent on exit',
      reason: 'Sent as the visitor left the page, so the browser could not wait to confirm it. If it is not in the inbox, check Junk.',
      raw: null
    };
  }
  const age = now - new Date(row.created_at).getTime();
  if (age >= 0 && age < SENDING_MS) {
    return { state: 'sending', label: 'Sending', reason: 'The visitor\'s browser has not reported back yet.', raw: null };
  }
  return {
    state: 'unknown', label: 'No reply',
    reason: "The visitor's browser never reported back. They probably closed the page before FormSubmit answered, so the email may or may not have gone.",
    raw: null
  };
}
