/**
 * One customer's story in order, for the client card: the enquiry, the
 * booking, the visit, messages tapped, money in, the report, the rating and
 * to-dos, plus what the assistant and staff recorded in their own words.
 * Built from the facts already kept, so it is right for old jobs too.
 * Amounts are named ...Pence so lib/figures.js hides them from a worker.
 */
import { query, queryOne } from './db.js';

const KIND = { quote: 'Quote sent', followup: 'Follow-up sent', reminder: 'Reminder sent', review: 'Review asked for' };
const CHANNEL = { whatsapp: 'by WhatsApp', sms: 'by text', email: 'by email' };

export async function timelineFor(scope, id) {
  const j = await queryOne(
    `select j.*, ((j.job_date + j.job_time) at time zone 'Europe/London') as visit_at, l.created_at as lead_at, l.site as lead_site from jobs j left join leads l on l.id = j.lead_id where j.id = $1`, [id]);
  if (!j || !scope.businesses.includes(j.site)) return null;
  const [msgs, pays, rating, todos, said] = await Promise.all([
    query('select kind, channel, sent_at from job_messages where job_id = $1', [id]),
    query('select amount_pence, paid_on::text as paid_on, created_at, label from job_payments where job_id = $1', [id]),
    queryOne('select stars, created_at from job_ratings where job_id = $1', [id]),
    query('select text, created_at, done_at from todos where job_id = $1', [id]),
    query(`select a.at, a.after_json->>'said' as said, p.name from audit a left join people p on p.id = a.person_id
            where a.entity = 'job' and a.entity_id = $1 and a.after_json ? 'said' order by a.at limit 50`, [id])
  ]);
  const ev = [];
  const add = (at, what, extra = {}) => { if (at) ev.push({ at: new Date(at).toISOString(), what, ...extra }); };
  add(j.lead_at, 'Enquiry came in from the website');
  const damp = ['dampscan', 'ati-london'].includes(j.site);
  add(j.created_at, damp ? 'Booked' : 'Job started');
  add(j.quote_sent_at, 'Quote sent');
  add(j.quote_accepted_at, 'Quote accepted');
  add(j.visit_at, damp ? (j.visit_at && new Date(j.visit_at) < new Date() ? 'Survey visit' : 'Survey booked for this time') : (j.visit_at && new Date(j.visit_at) < new Date() ? 'Survey or visit' : 'Survey or visit booked for this time'));
  /* A tick that a payment just made says the same thing twice: the payment line is kept, the tick only when it stands alone. */
  const near = (at) => at && pays.some((p) => p.created_at && Math.abs(new Date(p.created_at) - new Date(at)) < 5 * 60000);
  if (!near(j.deposit_paid_at)) add(j.deposit_paid_at, 'Deposit paid');
  if (!near(j.paid_at)) add(j.paid_at, 'Paid in full');
  add(j.report_at, `Report file saved${j.report_name ? ': ' + j.report_name : ''}`);
  add(j.report_ready_at, j.report_held ? 'Report ready, on hold' : 'Report ready: on their page, unlocked once paid in full');
  add(j.survey_sent_at, 'Report sent');
  add(j.on_way_at, 'Surveyor on the way (shown on their page)');
  msgs.forEach((m) => add(m.sent_at, `${KIND[m.kind] || m.kind} ${CHANNEL[m.channel] || ''}`.trim()));
  /* The moment it came in where we have it; an older row has only its day. */
  const PAID = { deposit: 'Deposit paid', balance: 'Paid in full', refund: 'Refunded' };
  pays.forEach((p) => add(p.created_at || `${p.paid_on}T12:00:00Z`, PAID[p.label] || 'Payment received', { amountPence: Number(p.amount_pence) }));
  if (rating) add(rating.created_at, `Rated us ${rating.stars} star${rating.stars === 1 ? '' : 's'}`);
  todos.forEach((t) => { add(t.created_at, `To-do: ${t.text}`); if (t.done_at) add(t.done_at, `Done: ${t.text}`); });
  said.forEach((s) => add(s.at, s.said.charAt(0).toUpperCase() + s.said.slice(1), { said: true, ...(s.name ? { by: s.name } : {}) }));
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
