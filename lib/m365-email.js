/**
 * The lead email sent from the owners' own Microsoft 365 mailbox, to their own
 * inbox only (never a customer). FormSubmit's bot check began refusing the
 * server's sends and visitors' ad blockers stop the browser's, so the owners'
 * mailbox is the first route and FormSubmit the fallback.
 *
 * Needs M365_USER (the mailbox) and M365_APP_PASSWORD (an app password made
 * for it), and SMTP sending allowed for that mailbox in Microsoft 365. Unset,
 * this route is skipped and nothing changes.
 */
import nodemailer from 'nodemailer';

export const m365Configured = () => Boolean((process.env.M365_USER || '').trim() && (process.env.M365_APP_PASSWORD || '').trim());

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** fields is the FormSubmit shape (lib/lead-email.js): _subject plus label/value pairs. */
export async function sendViaM365({ to, fields, replyTo, transport }) {
  if (!m365Configured() && !transport) return { ok: false, error: 'Microsoft 365 is not set up.' };
  const user = (process.env.M365_USER || '').trim();
  const rows = Object.entries(fields).filter(([k]) => !k.startsWith('_'));
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows
    .map(([k, v]) => `<tr><th align="left" style="border-bottom:1px solid #ddd;color:#555">${esc(k)}</th><td style="border-bottom:1px solid #ddd">${/^https?:\/\//.test(String(v)) ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`)
    .join('')}</table>`;
  const mailer = transport || nodemailer.createTransport({
    host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true,
    auth: { user, pass: (process.env.M365_APP_PASSWORD || '').trim() },
    connectionTimeout: 6000, greetingTimeout: 6000, socketTimeout: 8000
  });
  try {
    await mailer.sendMail({
      from: user || 'lead@localhost', to, subject: fields._subject, text, html,
      /* Reply goes straight to the customer, which is what a reply to an enquiry is for. */
      ...(replyTo ? { replyTo } : {})
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Microsoft 365: ' + String((err && err.message) || err).slice(0, 300) };
  }
}
