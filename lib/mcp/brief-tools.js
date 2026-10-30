/**
 * Briefings: the day ahead job by job, a customer's whole history, the end
 * of day sweep and the week in numbers.
 *
 * These are for the person doing the work, so a brief gives the full
 * address, phone and access notes that an alert never would. Money follows
 * the usual rule: only for whoever manages that business.
 */
import { query } from '../db.js';
import { present, businessFor } from '../quoted.js';
import { actionsFor } from '../work.js';
import { londonToday } from '../pipeline.js';
import { money, clock, customer } from '../alert-words.js';
import { read, fail, canManage, DATE } from './shared.js';
import { addDays } from './team-tools.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const SURVEYORS = { scott: 'Scott', tom: 'Tom', ben: 'Ben' };

const JOB_COLS = `j.*, coalesce(p.name, '') as assigned, l.address_line1, l.address_line2, l.town, l.notes as lead_notes, l.phone as lead_phone, l.email as lead_email,
  e.name as agent_name, e.branch as agent_branch, e.phone as agent_phone`;
const JOB_FROM = `jobs j left join people p on p.id = j.assigned_person_id left join leads l on l.id = j.lead_id left join estate_agents e on e.id = j.estate_agent_id`;

async function owedFor(j, scope) {
  if (!canManage(scope, j.site)) return null;
  const b = await businessFor(j.site);
  if (b.payout_model === 'damp') return j.paid_at ? '£0' : money(j.survey_price_pence);
  const p = await present(j, b);
  return money(p.money.outstandingPence);
}

async function briefMe(scope, { date, person }) {
  const d = date || londonToday();
  if (!ISO.test(d)) return fail('date is YYYY-MM-DD.');
  const rows = await query(`select ${JOB_COLS} from ${JOB_FROM}
      where j.site = any($1::text[]) and ((j.job_date = $2 and j.status in ('booked', 'completed') and coalesce(j.date_set, true)) or (j.site_visit_on = $2 and j.visit_done_at is null))
      order by j.job_time nulls last`, [scope.businesses, d]);
  const jobs = [];
  for (const j of rows) {
    const who = j.assigned || SURVEYORS[j.surveyor] || null;
    if (person && !(who || '').toLowerCase().startsWith(String(person).toLowerCase())) continue;
    const address = j.customer_address || [j.address_line1, j.address_line2, j.town].filter(Boolean).join(', ');
    const full = [address, j.customer_postcode].filter(Boolean).join(', ');
    const phone = j.customer_phone || j.lead_phone;
    const pc = String(j.customer_postcode || '').replace(/\s/g, '').toUpperCase();
    const history = pc ? await query(`select id, site, status, job_date::text as date from jobs where id <> $1 and site = any($2::text[]) and upper(replace(customer_postcode, ' ', '')) = $3 order by job_date desc limit 5`, [j.id, scope.businesses, pc]) : [];
    const todos = await query(`select text, due_on::text as due_on from todos where job_id = $1 and done_at is null`, [j.id]);
    jobs.push({ time: j.job_time ? clock(String(j.job_time)) : null, visit: iso(j.site_visit_on) === d, business: j.site, site: j.site, jobId: Number(j.id), who,
      customer: j.customer_name, address: full || null, maps: full ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}` : null,
      phone: phone || null, email: j.customer_email || j.lead_email || null, notes: [j.note, j.lead_notes].filter(Boolean).join('\n') || null,
      owed: await owedFor(j, scope), depositPaid: Boolean(j.deposit_paid_at), paidInFull: Boolean(j.paid_at), reportSent: Boolean(j.survey_sent_at),
      estateAgent: j.agent_name ? { name: j.agent_name, branch: j.agent_branch, phone: j.agent_phone, awaiting: Boolean(j.awaiting_agent) } : null,
      before: history.map((h) => ({ business: h.site, site: h.site, jobId: Number(h.id), status: h.status, date: h.date })), todos });
  }
  return ok({ date: d, count: jobs.length, jobs, tip: 'Go through them in time order: where, who to ask for, what is owed, anything from before.' });
}

async function history(scope, { words }) {
  const terms = String(words || '').toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1).slice(0, 5);
  if (!terms.length) return fail('Give a name, address, postcode, phone or email.');
  const p = terms.map((t) => `%${t.replace(/[%_\\]/g, '')}%`);
  const jc = terms.map((_, i) => `(lower(coalesce(customer_name,'') || ' ' || coalesce(customer_address,'') || ' ' || coalesce(customer_email,'')) like $${i + 2}
      or replace(lower(coalesce(customer_postcode,'') || ' ' || coalesce(customer_phone,'')), ' ', '') like replace($${i + 2}, ' ', ''))`).join(' and ');
  const lc = terms.map((_, i) => `(lower(first_name || ' ' || coalesce(address_line1,'') || ' ' || email) like $${i + 2}
      or replace(lower(postcode || ' ' || coalesce(phone,'')), ' ', '') like replace($${i + 2}, ' ', ''))`).join(' and ');
  const [jobs, leads] = await Promise.all([
    query(`select id, site, status, created_at, job_date::text as date, customer_name, customer_postcode, survey_price_pence, invoice_net_pence, paid_at, survey_sent_at
             from jobs where site = any($1::text[]) and ${jc} order by created_at desc limit 30`, [scope.businesses, ...p]),
    query(`select id, site, created_at, first_name, postcode, closed_at, closed_reason, (select count(*) from jobs where lead_id = leads.id)::int as jobs
             from leads where stage = 'complete' and site = any($1::text[]) and ${lc} order by created_at desc limit 30`, [scope.businesses, ...p])
  ]);
  return ok({
    jobs: jobs.map((j) => ({ business: j.site, site: j.site, jobId: Number(j.id), customer: j.customer_name, postcode: j.customer_postcode, status: j.status, created: iso(j.created_at), date: j.date, reportSent: Boolean(j.survey_sent_at), paid: Boolean(j.paid_at),
      ...(canManage(scope, j.site) ? { value: money(j.invoice_net_pence != null ? j.invoice_net_pence : j.survey_price_pence) } : {}) })),
    enquiries: leads.map((l) => ({ business: l.site, site: l.site, customer: customer(l.first_name, l.postcode), date: iso(l.created_at), outcome: l.jobs ? 'became a job' : l.closed_at ? `closed: ${l.closed_reason || 'no reason'}` : 'open' }))
  });
}

const WRAP = ['messages', 'reports', 'deposits', 'payments', 'invoices', 'todos', 'enquiries'];
async function wrapUp(scope, { date }) {
  const d = date || londonToday();
  if (!ISO.test(d)) return fail('date is YYYY-MM-DD.');
  const work = await actionsFor(scope, scope.businesses, { today: d });
  const loose = await query(`select id, site, customer_name, customer_postcode, status, visit_done_at, survey_sent_at from jobs
      where site = any($1::text[]) and job_date = $2 and coalesce(date_set, true) and status = 'booked'`, [scope.businesses, d]);
  const tomorrow = addDays(d, 1);
  const thin = await query(`select j.id, j.site, j.customer_name, j.customer_postcode, j.job_time, coalesce(j.customer_address, l.address_line1) as address from jobs j left join leads l on l.id = j.lead_id
      where j.site = any($1::text[]) and j.job_date = $2 and j.status = 'booked' and coalesce(j.date_set, true) and (j.job_time is null or coalesce(j.customer_address, l.address_line1) is null)`, [scope.businesses, tomorrow]);
  return ok({ date: d,
    notDoneToday: loose.map((j) => customer(j.customer_name, j.customer_postcode) + ` (${j.site})`),
    tomorrowMissing: thin.map((j) => ({ customer: customer(j.customer_name, j.customer_postcode), business: j.site, missing: [!j.job_time && 'time', !j.address && 'address'].filter(Boolean) })),
    groups: work.groups.filter((g) => WRAP.includes(g.key)).map((g) => ({ key: g.key, label: g.label, count: g.count, items: g.items.map((i) => ({ firstName: i.firstName, postcode: i.postcode, site: i.site, what: i.what, overdue: i.overdue, ...(i.owedPence != null ? { owed: money(i.owedPence) } : {}) })) })),
    tip: 'Say what is left from today first, then tomorrow\'s gaps, then each group. Offer job_done for visits not marked done.' });
}

async function weekNumbers(scope, from, to) {
  const s = scope.businesses;
  const manage = s.filter((x) => canManage(scope, x));
  const one = async (sql, params) => Number((await query(sql, params))[0].n || 0);
  return {
    enquiries: await one(`select count(*) n from leads where stage = 'complete' and site = any($1::text[]) and created_at >= $2 and created_at < $3`, [s, from, to]),
    bookings: await one(`select count(*) n from jobs where site = any($1::text[]) and status in ('booked','completed','paid') and created_at >= $2 and created_at < $3`, [s, from, to]),
    reportsSent: await one(`select count(*) n from jobs where site = any($1::text[]) and survey_sent_at >= $2 and survey_sent_at < $3`, [s, from, to]),
    reviews: await one(`select count(*) n from job_ratings r join jobs j on j.id = r.job_id where j.site = any($1::text[]) and r.created_at >= $2 and r.created_at < $3`, [s, from, to]),
    ...(manage.length ? { moneyInPence: await one(`select coalesce((select sum(p.amount_pence) from job_payments p join jobs j on j.id = p.job_id where j.site = any($1::text[]) and p.paid_on >= $2::date and p.paid_on < $3::date), 0)
        + coalesce((select sum(survey_price_pence) from jobs where site = any($1::text[]) and paid_at >= $2 and paid_at < $3), 0) as n`, [manage, from, to]) } : {})
  };
}

async function weekReview(scope, { weeks_ago: ago = 0 }) {
  const today = londonToday();
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow - 7 * Math.max(0, Number(ago) || 0));
  const [now, before] = await Promise.all([weekNumbers(scope, monday, addDays(monday, 7)), weekNumbers(scope, addDays(monday, -7), monday)]);
  const fmt = (o) => (o.moneyInPence != null ? { ...o, moneyIn: money(o.moneyInPence) } : o);
  const work = await actionsFor(scope, scope.businesses);
  const slipping = work.groups.map((g) => ({ label: g.label, overdue: g.items.filter((i) => i.overdue).length })).filter((g) => g.overdue);
  return ok({ week: { from: monday, to: addDays(monday, 6) }, thisWeek: fmt(now), previousWeek: fmt(before), slipping,
    tip: 'Compare each number with the week before in plain words, then say what is slipping.' });
}

const BRAND = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };

/* The Today list's "Collect paid in full" group, as a count and a list:
   work done (or the survey booked) and the balance not yet in. Money is the
   managers' only, so a worker sees none. */
async function stillToPay(scope, { site }) {
  const sites = site ? scope.businesses.filter((s) => s === site) : scope.businesses;
  const work = await actionsFor(scope, sites);
  const owing = work.groups.filter((g) => g.key === 'payments' || g.key === 'invoices').flatMap((g) => g.items);
  const total = owing.reduce((t, i) => t + (Number(i.owedPence) || 0), 0);
  const byBusiness = {};
  for (const i of owing) byBusiness[BRAND[i.site] || i.site] = (byBusiness[BRAND[i.site] || i.site] || 0) + 1;
  const list = owing.map((i) => ({ customer: [i.firstName, i.postcode].filter(Boolean).join(', '), business: BRAND[i.site] || i.site, date: i.date, owedPence: i.owedPence ?? null, overdue: Boolean(i.overdue) }));
  return { status: 200, data: { ok: true, said: owing.length ? `${owing.length} still to pay in full${total ? `, ${money(total)} in all` : ''}.` : 'Nobody is waiting to pay in full.', count: owing.length, totalPence: total, byBusiness, list } };
}

export const BRIEF_TOOLS = [
  read('still_to_pay', 'Still to pay in full', 'How many customers have not paid in full yet, with the total owed, a count per business and each one (first name, postcode, date, amount, overdue). The same as Today\'s "Collect paid in full". Managers only see amounts.', { site: { type: 'string', enum: ['dampscan', 'ati-london', 'roofing', 'ac'] } }, stillToPay),
  read('brief_me', 'Brief me', 'The day\'s jobs and site visits one by one: time, customer, full address with a maps link, notes, phone, what is owed (managers only), deposit, paid and report ticks, the estate agent, earlier jobs at that postcode in any business, and open to-dos for it. Default today; person narrows to one first name.',
    { date: DATE, person: { type: 'string' } }, briefMe),
  read('customer_history', 'Customer history', 'Every enquiry and job across all the person\'s businesses matching a name, address, postcode, phone or email, with dates, outcomes and value (managers only).', { words: { type: 'string' } }, history),
  read('wrap_up_day', 'Wrap up the day', 'End of day sweep: today\'s visits not marked done, tomorrow\'s jobs missing a time or address, messages due, reports to send, deposits and balances to collect, overdue invoices, to-dos due and enquiries not answered.', { date: DATE }, wrapUp),
  read('week_review', 'Week review', 'A week in numbers against the week before: enquiries, bookings, money in (managers only), reports sent, reviews, and what is slipping. weeks_ago 0 is this week.', { weeks_ago: { type: 'integer', minimum: 0, maximum: 52 } }, weekReview)
];
