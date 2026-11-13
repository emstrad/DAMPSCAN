/**
 * The words of the customer texts (the owners' plan, 11 Nov 2026), one per
 * kind and brand, editable on the Texts page (sms_templates); these are the
 * starting wording until the owners write their own. Fill-ins in braces are
 * replaced when the text goes, from the survey as it is at that moment.
 *
 * Friendly, and pointing to their own page (the owners' choice, 13 Nov 2026):
 * once a survey is booked every text carries the link, where they pay, see
 * when the surveyor is on the way, message us and ask to move, so it needs no
 * phone number. Before booking there is no page yet, so the enquiry texts give
 * our number (customers cannot reply to a text). Each fits two texts at most
 * (306 characters) with a long name and either brand's link.
 */
export const KINDS = {
  enquiry: { n: 1, label: 'Enquiry received', when: 'Form finished, no time picked: we call to book' },
  enquiry_time: { n: 1, label: 'Enquiry with a time asked for', when: 'Form finished and a time picked, for us to confirm' },
  enquiry_agent: { n: 1, label: 'Enquiry, estate agent letting us in', when: 'Form finished, the agent arranges access' },
  booked: { n: 2, label: 'Booked, deposit due', when: 'Booked online, or by us (2 minutes later)' },
  booked_paid: { n: 2, label: 'Booked, deposit already in', when: 'Booked with the deposit already paid' },
  paid: { n: 3, label: 'Payment received', when: 'A payment before the visit (card, transfer or ticked)' },
  paid_after: { n: 3, label: 'Payment received after the visit', when: 'A payment once the survey has been done' },
  today: { n: 4, label: 'Survey today', when: 'The morning of the survey, deposit paid' },
  today_unpaid: { n: 4, label: 'Survey today, deposit unpaid', when: 'The morning of the survey, deposit not paid' },
  ready: { n: 5, label: 'Report ready, balance due', when: 'Report ready ticked, balance still owed' },
  ready_paid: { n: 5, label: 'Report ready, already paid', when: 'Report ready ticked, nothing owed' },
  report: { n: 6, label: 'Your report', when: 'Paid in full after the report was ready' },
  moved: { n: 7, label: 'Survey moved', when: 'We change the date or time' }
};
/* The three enquiry wordings are one text (sent once): which one is picked as it goes. */
export const ENQUIRY_KINDS = ['enquiry', 'enquiry_time', 'enquiry_agent'];

export const DEFAULTS = {
  enquiry: 'Hi {first}, thanks for getting in touch with {brand}! We\'ll give you a call shortly to find a time that suits you for your damp survey. Any questions in the meantime, call us on {phone}.',
  enquiry_time: 'Hi {first}, thanks for choosing {brand}! We\'ve got your request for {date}, {window}. We\'ll call you shortly to confirm it. Any questions in the meantime, call us on {phone}.',
  enquiry_agent: 'Hi {first}, thanks for choosing {brand}! We\'ll arrange your survey with your estate agent and text you as soon as the time is confirmed. Any questions, call us on {phone}.',
  booked: 'Hi {first}, you\'re booked in with {brand} for {date}, arriving {window}. To secure it, please pay the {deposit} deposit on your page: {link} You can see your booking and message us there too.',
  booked_paid: 'Hi {first}, you\'re booked in with {brand} for {date}, arriving {window}, and your deposit is paid. Everything about your survey is on your page: {link} Message us there any time.',
  paid: 'Thanks {first}, we\'ve received your payment, {amount} paid so far. Your {brand} survey on {date}, {window}, is all set. Your receipt and booking are on your page: {link}',
  paid_after: 'Thanks {first}, we\'ve received your payment, {amount} paid in total. Your receipt is on your page: {link}',
  today: 'Good morning {first}! {surveyor} from {brand} is visiting you today, arriving {window}. Your page shows when they\'re on the way: {link}',
  today_unpaid: 'Good morning {first}! {surveyor} from {brand} is visiting you today, arriving {window}. Your {deposit} deposit is still to pay, please pay it on your page before they arrive: {link}',
  ready: 'Hi {first}, your {brand} survey report is ready! Pay the {balance} balance on your page and it unlocks straight away: {link}',
  ready_paid: 'Hi {first}, your {brand} survey report is ready! Read and download it on your page: {link} Any questions about it, message us there.',
  report: 'Thanks {first}, that\'s all paid. Your {brand} survey report is unlocked on your page: {link} Any questions about it, message us there.',
  moved: 'Hi {first}, your {brand} survey has moved to {date}, arriving {window}. Your page has the new time: {link} If it doesn\'t suit, message us there.'
};

/* What each fill-in looks like, for the Texts page's phone preview. */
export function sampleVars(site, brand) {
  const host = site === 'ati-london' ? 'https://atidampsurvey.co.uk' : 'https://dampscan.co.uk';
  return { first: 'Kim', brand: brand.name, phone: brand.phoneLabel, date: 'Tue 24 Nov', window: '9 to 10am', surveyor: 'Ben',
    total: '£295', deposit: '£147.50', balance: '£147.50', amount: '£147.50', link: `${host}/m/Ca0uljfgg6KiHG-W1Z6zwKuGo3EDrzcf` };
}

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
