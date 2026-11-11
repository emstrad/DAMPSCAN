/**
 * The words of the customer texts (the owners' plan, 11 Nov 2026), one per
 * kind and brand, editable on the Texts page (sms_templates); these are the
 * starting wording until the owners write their own. Fill-ins in braces are
 * replaced when the text goes, from the survey as it is at that moment.
 * Kept short: one text is 160 characters, more costs double.
 */
export const KINDS = {
  enquiry: { n: 1, label: 'Enquiry received', when: 'A website form is finished' },
  booked: { n: 2, label: 'Booked, deposit due', when: 'We book it in (sent 2 minutes later)' },
  booked_paid: { n: 2, label: 'Booked, deposit already in', when: 'We book it in with the deposit already paid' },
  paid: { n: 3, label: 'Payment received', when: 'A payment arrives or is ticked by hand' },
  paid_after: { n: 3, label: 'Payment received after the visit', when: 'A payment once the survey has been done' },
  today: { n: 4, label: 'Survey today', when: 'Morning of the survey, deposit paid' },
  today_unpaid: { n: 4, label: 'Survey today, deposit unpaid', when: 'Morning of the survey, deposit not paid' },
  ready: { n: 5, label: 'Report ready, balance due', when: 'Report ready ticked, balance owed' },
  ready_paid: { n: 5, label: 'Report ready, already paid', when: 'Report ready ticked, nothing owed' },
  report: { n: 6, label: 'Your report', when: 'Paid in full after the report was ready' },
  moved: { n: 7, label: 'Survey moved', when: 'We change the date or time' }
};

/* Each fits one text (160 characters) for either brand with a long first
   name and the page link, and each gives our number: customers cannot reply. */
export const DEFAULTS = {
  enquiry: 'Hi {first}, thanks for your enquiry with {brand}. We\'ll call you soon to arrange your survey. Questions? Call {phone}',
  booked: '{brand}: {first}, booked {date}, {window}. Deposit {deposit}: {link} Call {phone}',
  booked_paid: '{brand}: {first}, booked {date}, {window}. Deposit paid. {link} Call {phone}',
  paid: '{brand}: {first}, we\'ve received {amount}, thank you. Your survey on {date}, {window}, is confirmed. Call {phone}',
  paid_after: '{brand}: {first}, we\'ve received {amount}, thank you. Questions? Call {phone}',
  today: 'Morning {first}, {surveyor} from {brand} is with you today, arriving {window}. Questions? Call {phone}',
  today_unpaid: '{brand}: {first}, {surveyor} arrives today {window}. Deposit {deposit}: {link} Call {phone}',
  ready: '{brand}: {first}, your report is ready. Pay {balance} to unlock it: {link} Call {phone}',
  ready_paid: '{brand}: {first}, your report is ready to view: {link} Questions? Call {phone}',
  report: '{brand}: thanks {first}, paid in full. Your report is ready to view: {link} Call {phone}',
  moved: '{brand}: {first}, your survey has moved to {date}, arriving {window}. Questions? Call {phone}'
};

export const FILL_INS = ['first', 'brand', 'date', 'window', 'surveyor', 'total', 'deposit', 'amount', 'balance', 'link', 'phone'];

/** "9 to 10am", "11am to 12pm": the one-hour arrival window. */
export function windowOf(time) {
  if (!time) return 'at a time we\'ll confirm';
  const a = Number(String(time).slice(0, 2)), mins = String(time).slice(3, 5), b = (a + 1) % 24;
  const ap = (x) => (x < 12 ? 'am' : 'pm'), n = (x) => `${x % 12 || 12}${mins === '00' ? '' : ':' + mins}`;
  return ap(a) === ap(b) ? `${n(a)} to ${n(b)}${ap(b)}` : `${n(a)}${ap(a)} to ${n(b)}${ap(b)}`;
}

export const shortDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
export const pounds = (p) => `£${(Number(p || 0) / 100).toFixed(Number(p || 0) % 100 ? 2 : 0)}`;

/** Fills the braces; an unknown fill-in is left out rather than sent as {it}. */
export function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k]))).replace(/\s{2,}/g, ' ').trim();
}

/** How many texts a message costs: 160 characters each (153 once split), 70 if it holds an emoji or similar. */
export function segments(body) {
  const s = String(body || '');
  const plain = /^[\x20-\x7E\n£€]*$/.test(s);
  const one = plain ? 160 : 70, many = plain ? 153 : 67;
  return s.length <= one ? 1 : Math.ceil(s.length / many);
}
