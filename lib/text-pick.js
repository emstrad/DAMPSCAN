/**
 * Which wording a text goes with, worked out as it goes (the owners' rules,
 * 13 Nov 2026), so it always fits the customer's situation at that moment:
 *
 *   enquiry   no time picked, a time asked for (only with Book it straight
 *             away off), or their estate agent letting us in; dropped if
 *             they booked meanwhile or already had one this week
 *   partial   the form left part way: dropped once they finish or book, held
 *             while they are still filling it in, once a month per number
 *   booked    with or without the deposit in; "confirmed with your estate
 *             agent" when the agent has the keys
 *   paid      a deposit or part, paid in full, before or after the visit
 *   today     paid or not, the agent letting us in or not
 *   moved     ours, the time they asked for on their page, or agreed with
 *             their agent
 */
import { queryOne } from './db.js';
import { DAMP_BRANDS } from './survey-messages.js';
import { firstName } from './portal-view.js';
import { windowOf, dayWords, pounds, formLink } from './text-words.js';

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const DIGITS = `regexp_replace(regexp_replace(coalesce(x.phone, ''), '\\D', '', 'g'), '^44', '0')`;
export const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^44/, '0');

const LEAD = `select l.id, l.site, l.stage, l.from_partial, l.first_name, l.email, l.phone, l.session_id, l.closed_at, l.created_at, l.updated_at,
    l.pencil_date::text as pencil_day, to_char(l.pencil_time, 'HH24:MI') as pencil_hhmm, l.estate_agent_id,
    exists (select 1 from jobs j where j.lead_id = l.id and j.status <> 'cancelled') as booked
  from leads l where l.id = $1`;
export const PARTIAL_WAIT_MIN = 10;

/* The same mobile had this kind of text lately (the form sent twice, a second visit). */
async function hadLately(kind, row, phone, days) {
  if (!phone) return false;
  return Boolean(await queryOne(`select 1 from sms_outbox o join leads x on x.id = o.lead_id where o.kind = $1 and o.site = $2 and o.id <> $3
      and o.status in ('sent', 'sending') and o.sent_at > now() - make_interval(days => $5) and ${DIGITS} = $4 limit 1`, [kind, row.site, row.id, phone, days]));
}

/* They finished the form after all, or are booked, as the same person (session, email or phone). */
async function finishedSince(l) {
  return Boolean(await queryOne(`select 1 from leads x where x.site = $1 and x.id <> $2 and x.stage = 'complete' and not x.from_partial
      and x.created_at >= $3::timestamptz - interval '1 hour'
      and (x.session_id = $4 or (x.email <> '' and lower(x.email) = lower($5)) or ($6 <> '' and ${DIGITS} = $6)) limit 1`,
    [l.site, l.id, l.created_at, l.session_id, l.email || '', digits(l.phone)]))
    || Boolean(await queryOne(`select 1 from jobs x where x.site = $1 and x.status <> 'cancelled' and x.created_at >= $2::timestamptz - interval '1 hour'
      and ((x.customer_email <> '' and lower(x.customer_email) = lower($3)) or ($4 <> '' and regexp_replace(regexp_replace(coalesce(x.customer_phone, ''), '\\D', '', 'g'), '^44', '0') = $4)) limit 1`,
    [l.site, l.created_at, l.email || '', digits(l.phone)]));
}

/**
 * An enquiry or unfinished-form text: { kind, vars } to send, { skip } with
 * the reason to stop it, or { later } to try again in a few minutes.
 */
export async function leadText(row) {
  const l = await queryOne(LEAD, [row.lead_id]);
  if (!l) return { skip: 'The enquiry is gone.' };
  if (l.booked) return { skip: 'Booked meanwhile: the booked text covers it.' };
  if (l.closed_at) return { skip: 'The enquiry was closed.' };
  const phone = digits(l.phone);
  if (row.kind === 'partial') {
    if (l.stage === 'complete' && !l.from_partial) return { skip: 'They finished the form.' };
    if (await finishedSince(l)) return { skip: 'They finished the form or booked after all.' };
    if (l.updated_at && Date.now() - new Date(l.updated_at).getTime() < PARTIAL_WAIT_MIN * 60000) return { later: true };
    if (await hadLately('partial', row, phone, 30)) return { skip: 'They had this text in the last month.' };
  } else if (await hadLately('enquiry', row, phone, 7)) return { skip: 'They had a thanks this week (the form sent again).' };
  const brand = DAMP_BRANDS[l.site];
  const kind = row.kind === 'partial' ? 'partial' : l.pencil_day ? 'enquiry_time' : l.estate_agent_id ? 'enquiry_agent' : 'enquiry';
  return { kind, phone: l.phone, vars: { first: firstName(l.first_name) || 'there', brand: brand.name, phone: brand.phoneLabel,
    date: dayWords(l.pencil_day), window: windowOf(l.pencil_hhmm), form: formLink(l.site) } };
}

/** The wording for a survey's text, from the kind queued and the survey as it is now. */
export function jobKind(kind, j, m) {
  const agent = Boolean(j.estate_agent_id);
  const before = j.status === 'booked' && j.job_day && j.job_day >= londonToday();
  if (kind === 'booked') return (agent ? 'booked_agent' : 'booked') + (m.depositPaid ? '_paid' : '');
  if (kind === 'paid') return before ? (m.paidInFull ? 'paid_full' : 'paid') : (m.paidInFull ? 'paid_after_full' : 'paid_after');
  if (kind === 'today' || kind === 'today_unpaid') return (agent ? 'today_agent' : 'today') + (m.depositPaid ? '' : '_unpaid');
  if (kind === 'moved') {
    const asked = j.move_request && j.move_request.date === j.job_day && String(j.move_request.time || '').slice(0, 5) === j.hhmm;
    return asked ? 'moved_asked' : agent ? 'moved_agent' : 'moved';
  }
  return kind;
}

/** The fill-ins for a survey's text. */
export function jobVars(j, m, link) {
  const brand = DAMP_BRANDS[j.site];
  return {
    first: firstName(j.customer_name) || j.lead_first || 'there', brand: brand.name, phone: brand.phoneLabel, form: formLink(j.site),
    date: dayWords(j.job_day), window: windowOf(j.hhmm), surveyor: j.surveyor ? j.surveyor[0].toUpperCase() + j.surveyor.slice(1) : 'your surveyor',
    total: pounds(m.pricePence), deposit: pounds(m.minNowPence || m.depositPence), balance: pounds(m.balancePence), amount: pounds(m.paidPence), link
  };
}
