/**
 * The words of the customer texts, one per kind and brand, editable on the
 * Texts page (sms_templates); these are the starting wording until the owners
 * write their own. Fill-ins in braces are replaced when the text goes, from
 * the survey as it is at that moment.
 *
 * The owners' choices (11 and 13 Nov 2026): friendly, never salesy, and once a
 * survey is booked every text points to the customer's own page, where they
 * pay, message us, ask to move and see when the surveyor is on the way, so it
 * needs no phone number. Before booking there is no page yet, so those texts
 * give our number (customers cannot reply to a text). Length is no worry: a
 * clear text pays for itself.
 *
 * Each step (n) has wordings for its situations; lib/text-pick.js chooses the
 * one that fits as the text goes (an estate agent letting us in, the deposit
 * already paid, a move the customer asked for, and so on).
 */
export const KINDS = {
  partial: { n: 1, label: 'Didn\'t finish the form', when: '10 minutes after they stopped part way, with a mobile given; once a month at most' },
  enquiry: { n: 1, label: 'Enquiry received', when: 'Form finished without booking a time: we call to book' },
  enquiry_agent: { n: 1, label: 'Enquiry, estate agent letting us in', when: 'Form finished, the agent arranges access' },
  enquiry_time: { n: 1, label: 'Enquiry with a time asked for', when: 'Only with the Lab\'s Book it straight away off: a time picked for us to confirm' },
  booked: { n: 2, label: 'Booked, deposit due', when: 'Booked online (at once) or by us (2 minutes later)' },
  booked_paid: { n: 2, label: 'Booked, deposit already in', when: 'Booked with the deposit already paid' },
  booked_agent: { n: 2, label: 'Booked with the estate agent, deposit due', when: 'The time confirmed with their estate agent, who lets us in' },
  booked_agent_paid: { n: 2, label: 'Booked with the estate agent, deposit in', when: 'Confirmed with the agent, deposit already paid' },
  deposit_reminder: { n: 2, label: 'Deposit reminder', when: 'Once, 2 days after booking with no deposit, while the survey is over a day away' },
  paid: { n: 3, label: 'Payment received', when: 'A deposit or part payment before the visit' },
  paid_full: { n: 3, label: 'Paid in full before the visit', when: 'Everything paid before the visit' },
  paid_after: { n: 3, label: 'Payment after the visit', when: 'A part payment after the visit, report not ready yet' },
  paid_after_full: { n: 3, label: 'Paid in full after the visit', when: 'All paid after the visit, report not ready yet' },
  today: { n: 4, label: 'Survey today', when: 'The survey morning (from 7am), deposit paid' },
  today_unpaid: { n: 4, label: 'Survey today, deposit unpaid', when: 'The survey morning, deposit not paid' },
  today_agent: { n: 4, label: 'Survey today, agent letting us in', when: 'The survey morning, the agent has the keys, deposit paid' },
  today_agent_unpaid: { n: 4, label: 'Survey today, agent, deposit unpaid', when: 'The survey morning, the agent has the keys, deposit not paid' },
  ready: { n: 5, label: 'Report ready, balance due', when: 'Report ready ticked, balance still owed' },
  ready_paid: { n: 5, label: 'Report ready, already paid', when: 'Report ready ticked, nothing owed' },
  balance_reminder: { n: 5, label: 'Report waiting reminder', when: 'Once, 3 days after report ready with the balance still owed' },
  report: { n: 6, label: 'Your report', when: 'Paid in full after the report was ready' },
  moved: { n: 7, label: 'Survey moved', when: 'We change the date or time' },
  moved_asked: { n: 7, label: 'Moved as they asked', when: 'We move it to the time they asked for on their page' },
  moved_agent: { n: 7, label: 'Moved with the estate agent', when: 'A new time agreed with their estate agent' }
};
/* Kinds put in the outbox; the others are wordings chosen from these as the text goes. */
export const QUEUED = ['partial', 'enquiry', 'booked', 'deposit_reminder', 'paid', 'today', 'today_unpaid', 'ready', 'ready_paid', 'balance_reminder', 'report', 'moved'];

export const DEFAULTS = {
  partial: 'Hi {first}, it\'s {brand}. We noticed you didn\'t quite get to the end of our booking form, no problem at all. Is there anything we can help with? Just call us on {phone}, or finish it here whenever suits: {form}',
  enquiry: 'Hi {first}, thanks for getting in touch with {brand}! We\'ll give you a call shortly to find a time that suits you for your damp survey. Any questions in the meantime, call us on {phone}.',
  enquiry_agent: 'Hi {first}, thanks for choosing {brand}! We\'ll arrange a time with your estate agent and text you as soon as it\'s confirmed. Any questions in the meantime, call us on {phone}.',
  enquiry_time: 'Hi {first}, thanks for choosing {brand}! We\'ve got your request for {date}, {window}. We\'ll call you shortly to confirm it. Any questions in the meantime, call us on {phone}.',
  booked: 'Hi {first}, you\'re booked in with {brand} for {date}, arriving {window}. To secure your survey, please pay the {deposit} deposit on your page: {link} Your page also shows your booking, lets you message us or ask to move, and tells you when {surveyor} is on the way.',
  booked_paid: 'Hi {first}, you\'re booked in with {brand} for {date}, arriving {window}, and your deposit is paid, thank you. Everything is on your page: {link} You can message us there, ask to move, and see when {surveyor} is on the way.',
  booked_agent: 'Hi {first}, we\'ve confirmed your {brand} survey with your estate agent: {date}, arriving {window}. They\'ll let {surveyor} in, so you don\'t need to be there unless you\'d like to. To secure it, please pay the {deposit} deposit on your page: {link}',
  booked_agent_paid: 'Hi {first}, we\'ve confirmed your {brand} survey with your estate agent: {date}, arriving {window}. They\'ll let {surveyor} in, so you don\'t need to be there unless you\'d like to. Your deposit is paid, thank you. Everything is on your page: {link}',
  deposit_reminder: 'Hi {first}, a friendly reminder from {brand}: your survey ({date}, {window}) is booked in, but the {deposit} deposit is still to pay. It only takes a minute on your page: {link} If anything has changed, just message us there.',
  paid: 'Thanks {first}, we\'ve received your payment ({amount} paid so far). Your {brand} survey ({date}, {window}) is secured. Your receipt is on your page, along with the {balance} left to pay after the visit: {link}',
  paid_full: 'Thanks {first}, you\'re all paid up! Your {brand} survey ({date}, {window}) is secured and there\'s nothing more to pay. Your receipt is on your page: {link}',
  paid_after: 'Thanks {first}, we\'ve received your payment ({amount} paid so far, {balance} still to pay). Your receipt is on your page: {link} We\'ll text you as soon as your report is ready.',
  paid_after_full: 'Thanks {first}, you\'re all paid up! Your receipt is on your page: {link} We\'ll text you the moment your report is ready to read.',
  today: 'Good morning {first}! {surveyor} from {brand} is visiting you today, arriving {window}. Your page will show you when they\'re on the way: {link}',
  today_unpaid: 'Good morning {first}! {surveyor} from {brand} is visiting you today, arriving {window}. Your {deposit} deposit is still to pay, please pay it on your page before they arrive: {link} It\'ll also show you when they\'re on the way.',
  today_agent: 'Good morning {first}! {surveyor} from {brand} is surveying your property today, arriving {window}, and your estate agent is letting them in. Your page shows when they\'re on the way: {link}',
  today_agent_unpaid: 'Good morning {first}! {surveyor} from {brand} is surveying your property today, arriving {window}, and your estate agent is letting them in. Your {deposit} deposit is still to pay, please pay it on your page before the visit: {link}',
  ready: 'Hi {first}, your {brand} survey report is ready! Pay the {balance} balance on your page and it unlocks straight away: {link} Any questions about it, message us there.',
  ready_paid: 'Hi {first}, your {brand} survey report is ready! Read and download it on your page: {link} Any questions about it, message us there.',
  balance_reminder: 'Hi {first}, a reminder from {brand} that your survey report is ready and waiting. Pay the {balance} balance on your page and you can read it straight away: {link}',
  report: 'Thanks {first}, that\'s all paid. Your {brand} survey report is unlocked on your page: {link} Any questions about it, message us there.',
  moved: 'Hi {first}, your {brand} survey has moved to {date}, arriving {window}. Your page has the new time: {link} If it doesn\'t suit, message us there or ask to move.',
  moved_asked: 'Hi {first}, all done! As you asked, your {brand} survey is now {date}, arriving {window}. Your page has the new time: {link}',
  moved_agent: 'Hi {first}, we\'ve agreed a new time with your estate agent: your {brand} survey is now {date}, arriving {window}. Your page has the details: {link}'
};

export const FILL_INS = ['first', 'brand', 'date', 'window', 'surveyor', 'total', 'deposit', 'amount', 'balance', 'link', 'phone', 'form'];

const HOST = { dampscan: 'https://dampscan.co.uk', 'ati-london': 'https://atidampsurvey.co.uk' };
/** The booking form on the brand's own site, for the unfinished-form text. */
export const formLink = (site) => `${HOST[site] || HOST.dampscan}/#book`;

/* What each fill-in looks like, for the Texts page's phone preview. */
export function sampleVars(site, brand) {
  return { first: 'Kim', brand: brand.name, phone: brand.phoneLabel, date: 'Tue 24 Nov', window: '9 to 10am', surveyor: 'Ben',
    total: '£295', deposit: '£147.50', balance: '£147.50', amount: '£147.50', form: formLink(site),
    link: `${HOST[site] || HOST.dampscan}/m/Ca0uljfgg6KiHG-W1Z6zwKuGo3EDrzcf` };
}

/** "9 to 10am", "11am to 12pm": the one-hour arrival window. */
export function windowOf(time) {
  if (!time) return 'at a time we\'ll confirm';
  const a = Number(String(time).slice(0, 2)), mins = String(time).slice(3, 5), b = (a + 1) % 24;
  const ap = (x) => (x < 12 ? 'am' : 'pm'), n = (x) => `${x % 12 || 12}${mins === '00' ? '' : ':' + mins}`;
  return ap(a) === ap(b) ? `${n(a)} to ${n(b)}${ap(b)}` : `${n(a)}${ap(a)} to ${n(b)}${ap(b)}`;
}

export const shortDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
/** "today", "tomorrow", else "Tue 24 Nov": how a person says it. */
export function dayWords(iso, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return d === today ? 'today' : d === next.toISOString().slice(0, 10) ? 'tomorrow' : shortDate(d);
}
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
