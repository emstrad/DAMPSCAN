/**
 * What a customer's page shows (lib/portal.js finds the survey, this works out
 * the view), customer-safe: never staff notes, to-dos, pay or anyone else's
 * diary. One state at a time, urgent first (the owners' plan, 11 Nov 2026):
 *
 *   requested  a time picked online, not yet confirmed
 *   waiting    no date yet (or taken off the diary): we will arrange one
 *   agent      access is being arranged with the estate agent
 *   deposit    booked, less than the deposit paid
 *   booked     booked, deposit or more paid
 *   writing    surveyed, report not ready
 *   ready      report ready, balance owed (the report unlocks on the full balance)
 *   report     paid in full and reported: download, then a review
 *   cancelled  with the refund rule: full refund 48 hours or more before, else kept
 *
 * Amounts come from what has really been paid (job_payments, or the deposit
 * and paid-in-full ticks when nothing is itemised), never from the page.
 */
import { DAMP_BRANDS } from './survey-messages.js';
import { pickedExtras } from './book-extras.js';

const ORIGIN = { dampscan: 'https://dampscan.co.uk', 'ati-london': 'https://atidampsurvey.co.uk' };
const REVIEW = { dampscan: 'REVIEW_URL_DAMPSCAN', 'ati-london': 'REVIEW_URL_ATI' };
/* The page roots carry a code, never a brand name (the sites never name each other). */
const CODE = { dampscan: 's1', 'ati-london': 's2' };
const REFUND_HOURS = 48;
/* Each brand's mark, sent with the page so the shared files name neither brand. */
const MARK = {
  dampscan: { word: ['Damp', 'Scan'], tag: 'Survey Specialists' },
  'ati-london': { img: '/assets/ati-mark.png', alt: 'ATi Damp Survey', tag: 'Independent Damp Surveys & Reports' }
};
export const brandOf = (site) => (DAMP_BRANDS[site] ? { name: DAMP_BRANDS[site].name, phoneLabel: DAMP_BRANDS[site].phoneLabel,
  phone: DAMP_BRANDS[site].phoneLabel.replace(/\s/g, ''), origin: ORIGIN[site], mark: MARK[site] } : null);
export const codeOf = (site) => CODE[site] || null;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
export const firstName = (n) => String(n || '').trim().split(/\s+/).find((w) => !/^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(w)) || null;

/** The bank reference: their first name and the survey number, nothing to mistype. */
export function referenceFor(name, id) {
  const letters = String(firstName(name) || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'SURVEY';
  return `${letters}${String(id).padStart(4, '0')}`;
}

/** The survey's start in London as a Date (an untimed survey starts with its day). */
export function startOf(day, time) {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = String(time || '00:00').slice(0, 5).split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  /* London is UTC or one hour ahead; find the offset that day. */
  const shown = new Date(guess).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false });
  const offset = (Number(shown) - hh + 24) % 24;
  return new Date(guess - offset * 3600000);
}

/** What has been paid, the deposit, what is due now and any credit. */
export function moneyOf(j) {
  const price = Number(j.survey_price_pence) || 0;
  const deposit = Math.ceil(price / 2);
  const ledger = Number(j.paid_pence) || 0;
  const ticks = j.paid_at ? price : j.deposit_paid_at ? deposit : 0;
  const refunded = Number(j.refunded_pence) || 0;
  const paid = Math.max(ledger, ticks);
  const extras = pickedExtras(j.extras || []).map((x) => ({ name: x.name, pence: x.price * 100 }));
  const extrasTotal = extras.reduce((t, x) => t + x.pence, 0);
  const lines = extras.length ? [{ name: j.survey_label || 'Damp survey', pence: Math.max(0, price - extrasTotal) }, ...extras] : null;
  return {
    pricePence: price, depositPence: deposit, paidPence: paid, refundedPence: refunded,
    minNowPence: Math.max(0, deposit - paid), balancePence: Math.max(0, price - paid), creditPence: Math.max(0, paid - price),
    depositPaid: paid >= deposit && price > 0, paidInFull: price > 0 && paid >= price, lines
  };
}

/* Cancelled: was it 48 hours or more before the survey? */
function cancelRule(j, money) {
  if (!money.paidPence) return 'none';
  if (money.refundedPence >= money.paidPence) return 'refunded';
  const start = startOf(j.job_day, j.job_time);
  const at = j.cancelled_at ? new Date(j.cancelled_at) : null;
  if (!start || !at) return 'refund';
  return start.getTime() - at.getTime() >= REFUND_HOURS * 3600000 ? 'refund' : 'kept';
}

function stateOf(j, money, today) {
  if (['cancelled', 'declined', 'refunded'].includes(j.status)) return 'cancelled';
  const dated = j.date_set && j.job_day && j.job_time;
  const done = j.date_set && j.job_day && (['completed', 'paid'].includes(j.status) || j.job_day < today);
  if (j.survey_sent_at && j.report_path && money.paidInFull) return 'report';
  if (j.survey_sent_at) return 'ready';
  if (done) return 'writing';
  if (j.awaiting_agent) return 'agent';
  if (!dated) return j.pencil_date ? 'requested' : 'waiting';
  return money.depositPaid || money.pricePence === 0 ? 'booked' : 'deposit';
}

const STEP = { requested: 0, waiting: 0, agent: 0, deposit: 1, booked: 1, writing: 2, ready: 3, report: 4, cancelled: 0 };

/** Everything the page draws, worked out once on the server. */
export function buildView(j, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) {
  const money = moneyOf(j);
  const state = stateOf(j, money, today);
  const dated = j.date_set && j.job_day && j.job_time && !j.awaiting_agent;
  const lead = { said: j.lead_notes || null, issues: j.lead_issues || [], photos: (j.lead_files || []).filter((f) => /\.(jpe?g|png|gif|webp|heic)$/i.test(f)).length };
  return {
    site: j.site, code: CODE[j.site], state, step: STEP[state],
    brand: brandOf(j.site),
    firstName: firstName(j.customer_name),
    reference: referenceFor(j.customer_name, j.id),
    survey: j.survey_label || 'Damp survey',
    address: [j.customer_address || j.address_line1, j.customer_postcode].filter(Boolean).join(', ') || null,
    visit: dated ? { date: j.job_day, time: String(j.job_time).slice(0, 5), surveyor: cap(j.surveyor) } : null,
    requested: state === 'requested' ? { date: String(j.pencil_date).slice(0, 10), time: String(j.pencil_time || '').slice(0, 5) || null } : null,
    agent: j.agent_name ? [j.agent_name, j.agent_branch].filter(Boolean).join(', ') : null,
    money,
    payTo: j.payment_details || null,
    cancel: state === 'cancelled' ? { rule: cancelRule(j, money), pence: money.paidPence } : null,
    enquiry: lead.said || lead.issues.length || lead.photos ? lead : null,
    report: j.survey_sent_at ? { unlocked: state === 'report', name: j.report_name || 'Survey report.pdf' } : null,
    reviewUrl: state === 'report' ? process.env[REVIEW[j.site]] || null : null,
    refundHours: REFUND_HOURS,
    payOnline: Boolean((process.env.REVOLUT_MERCHANT_KEY || '').trim()) && process.env.PAY_ONLINE !== 'off'
  };
}
