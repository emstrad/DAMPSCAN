/**
 * The "Action needed" list: everything outstanding across the businesses a
 * person may see, grouped the way a working day goes, each item small enough
 * to act on where it sits (call, send, tick, set a date).
 *
 * It is assembled, not re-queried: the Due page's own sections (due-sections.js)
 * supply enquiries, messages, quotes, money owed and services, the to-do list
 * comes from todos.js and over-budget jobs from Insights. Only the few facts
 * no list held yet (deposits to take, reports to send, surveys waiting on an
 * estate agent, accepted quotes with no booking) are read here. Payouts ready
 * to freeze, and frozen ones a late line has moved, come from Due as well, so
 * Today holds everything the Due page did (its week of visits is the calendar). The calendar route and the
 * assistant's what_needs_doing both call actionsFor, so they always agree.
 *
 * Money groups and amounts are only built for moneySites: a worker sees the
 * day's work, never what a job is worth or what is owed on it.
 */
import { query } from './db.js';
import { TODAY } from './today.js';
import { mobileFor } from './messages.js';
import { londonToday } from './pipeline.js';
import { listTodos } from './todos.js';
import { messages, enquiries, quotes, services, owed, payouts } from './due-sections.js';
import { overBudget } from './routes/admin/insights.js';
import { roofActions } from './roofing-today.js';
import { warrantiesEnding } from './coolright-kit.js';
import { REPORT_DUE, REPORT_DAYS, REPORT_LATE, REMEDIAL_DUE } from './surveys.js';
import { day as niceDay } from './alert-words.js';

/* Order and wording of the groups, as the Today panel shows them. */
export const GROUPS = [
  ['enquiries', 'Call back new enquiries'],
  ['messages', 'Messages to send'],
  ['nodate', 'Jobs with no date'],
  ['agent', 'Surveys awaiting estate agent'],
  ['reports', 'Reports to send'],
  ['remedial', 'Remedial work to follow up'],
  ['prep', 'Roofing jobs to get ready'],
  ['deposits', 'Deposits to collect'],
  ['payments', 'Payments to collect'],
  ['invoices', 'Overdue invoices'],
  ['payouts', 'Payouts to freeze'],
  ['quotes', 'Quotes to chase'],
  ['todos', 'To-dos for me'],
  ['finish', 'Finish off roofing jobs'],
  ['services', 'Services due'],
  ['warranty', 'Warranty ending'],
  ['budget', 'Over budget']
];
/* A finished job unpaid for longer than this is an overdue invoice rather than a payment to collect. */
export const INVOICE_OVERDUE_DAYS = 14;
const LIMIT = 40;
const day = (v) => (v == null ? null : String(v).slice(0, 10));
const first = (name) => String(name || '').trim().split(/\s+/).find((w) => !/^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(w)) || null;
const age = (iso, today) => (iso ? Math.round((Date.parse(today) - Date.parse(day(iso))) / 86400000) : 0);

/** Facts only this list needs: damp deposits, damp reports, agent waits and undated work. */
async function extras(sites, moneySites) {
  const rows = await query(
    `select j.id, j.site, j.status, j.job_date::text as job_date, j.job_time, j.customer_name, j.customer_postcode, b.payout_model,
            j.awaiting_agent, j.deposit_paid_at is not null as deposit, j.paid_at is not null as paid, j.survey_sent_at is not null as sent,
            j.quote_accepted_at is not null as accepted, j.won_at is not null as won, j.started_at is null as unstarted, j.site = any($2::text[]) as money,
            coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) as received, j.invoice_net_pence,
            (b.payout_model = 'damp' and ${REPORT_DUE}) as report_due, ${REPORT_DAYS} as report_days, ${REPORT_LATE} as report_late, (b.payout_model = 'damp' and ${REMEDIAL_DUE}) as remedial_due
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined', 'refunded')
        and ((b.payout_model = 'damp' and j.status = 'booked' and j.awaiting_agent)
          or (b.payout_model = 'damp' and j.status = 'booked' and j.deposit_paid_at is null and j.paid_at is null and j.job_date >= ${TODAY})
          or (b.payout_model = 'damp' and ${REPORT_DUE})
          or (b.payout_model = 'damp' and ${REMEDIAL_DUE})
          /* Verge and CoolRight take a deposit once the customer says yes:
             accepted or booked, not yet started, and nothing received. */
          or (b.payout_model <> 'damp' and j.invoice_net_pence > 0 and j.started_at is null
            and (j.status = 'booked' or (j.status = 'quoted' and (j.quote_accepted_at is not null or j.won_at is not null)))
            and not exists (select 1 from job_payments p where p.job_id = j.id))
          /* A job always holds a date, so "no date" is a quote the customer
             accepted that nobody has booked in yet: its date is only when it was made. */
          or (j.status = 'quoted' and j.quote_accepted_at is not null))
      order by j.job_date, j.id limit 200`, [sites, moneySites]);
  const out = { agent: [], deposits: [], reports: [], remedial: [], nodate: [] };
  for (const r of rows) {
    const base = { id: Number(r.id), site: r.site, status: r.status, date: day(r.job_date), time: r.job_time ? String(r.job_time).slice(0, 5) : null,
      customerName: r.customer_name, postcode: r.customer_postcode, quoted: r.payout_model !== 'damp' };
    if (r.payout_model === 'damp' && r.awaiting_agent && r.status === 'booked') out.agent.push(base);
    else if (r.payout_model === 'damp' && r.status === 'booked' && !r.deposit && !r.paid && r.money && r.job_date) out.deposits.push(base);
    else if (r.payout_model !== 'damp' && r.money && Number(r.received) <= 0 && Number(r.invoice_net_pence) > 0 && !(r.status === 'quoted' && !r.accepted && !r.won)) out.deposits.push({ ...base, quotedDeposit: true });
    if (r.report_due) out.reports.push({ ...base, days: Number(r.report_days), late: Boolean(r.report_late) });
    if (r.remedial_due) out.remedial.push(base);
    if (r.status === 'quoted' && r.accepted) out.nodate.push({ ...base, date: null, time: null });
  }
  return out;
}

/** Phone numbers for every job named in the list, the job's own first and the enquiry's behind it. */
async function phones(ids) {
  if (!ids.length) return new Map();
  const rows = await query(
    `select j.id, coalesce(j.customer_phone, l.phone) as phone from jobs j left join leads l on l.id = j.lead_id where j.id = any($1::bigint[])`, [ids]);
  return new Map(rows.map((r) => [Number(r.id), r.phone]));
}

function item(group, r, extra = {}) {
  return { group, key: `${group}-${r.id}`, id: r.id, jobId: r.id, site: r.site, firstName: first(r.customerName), postcode: r.postcode || null,
    date: r.date || null, time: r.time || null, status: r.status || null, quoted: r.quoted !== false, overdue: false, actions: ['open'], ...extra };
}

/**
 * Everything outstanding for these sites. `sites` are the sites asked for,
 * already scoped; money groups use only those the person manages.
 */
export async function actionsFor(scope, sites, { today = londonToday() } = {}) {
  const moneySites = sites.filter((s) => scope.isAdmin || scope.levels[s] === 'manage');
  const [enq, partials, msg, quo, svc, own, ext, todos, budget, pay, roof, ending] = await Promise.all([
    enquiries(sites),
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone from leads l
            where l.site = any($1::text[]) and l.stage = 'partial' and l.closed_at is null and l.phone is not null and l.created_at >= now() - interval '7 days'
              and not exists (select 1 from leads c where c.session_id = l.session_id and c.stage = 'complete')
            order by l.created_at desc limit ${LIMIT}`, [sites]),
    messages(sites), quotes(sites), services(sites), owed(moneySites), extras(sites, moneySites),
    listTodos(scope, 'open'), moneySites.length ? overBudget(moneySites) : [], moneySites.length ? payouts(moneySites) : { ready: [], drifted: [] },
    roofActions(sites), warrantiesEnding(sites)
  ]);
  const leadPhones = enq.length ? await query('select id, phone from leads where id = any($1::bigint[])', [enq.map((e) => e.id)]) : [];
  const leadPhone = new Map(leadPhones.map((l) => [Number(l.id), l.phone]));
  const items = [];
  const lead = (l, partial) => ({ group: 'enquiries', key: `lead-${l.id}`, id: Number(l.id), jobId: null, site: l.site, firstName: l.first_name || l.firstName || null,
    postcode: l.postcode || null, date: day(l.created_at || l.createdAt), what: partial ? 'Started the form but did not finish' : `New enquiry${(l.issues || []).length ? ': ' + l.issues.join(', ') : ''}`,
    phone: partial ? l.phone : leadPhone.get(Number(l.id)) || null, overdue: age(l.created_at || l.createdAt, today) > 2, actions: ['call', 'leads'] });
  enq.forEach((l) => items.push(lead(l, false)));
  partials.forEach((l) => items.push(lead(l, true)));
  const messaged = new Set();
  for (const m of msg) {
    messaged.add(m.id);
    items.push(item('messages', { ...m, quoted: true }, { what: m.message.kind === 'followup' ? `Quote follow-up ${m.message.followupNumber}` : m.message.kind === 'rating' ? (m.message.followupNumber > 1 ? 'Chase the rating' : 'Ask how we did') :
      { reminder: 'Booking reminder for tomorrow', review: 'Ask for a review', yearly: 'Yearly check' }[m.message.kind] || 'Message', message: m.message, actions: ['open', 'message'] }));
  }
  for (const q of quo) {
    if (q.acceptedAt || messaged.has(q.id) || q.ageDays < 3) continue;
    items.push(item('quotes', { ...q, status: 'quoted' }, { what: `Quote out ${q.ageDays} days, no answer`, overdue: q.ageDays > 14, actions: ['open', 'call'] }));
  }
  ext.nodate.forEach((r) => items.push(item('nodate', r, { what: 'Quote accepted, needs a date', actions: ['open', 'call', 'date'] })));
  roof.prep.forEach((r) => items.push(item('prep', r, { what: r.what, overdue: r.date <= today, actions: ['open', 'call'] })));
  roof.finish.forEach((r) => items.push(item('finish', r, { what: r.what, actions: ['open'] })));
  ext.agent.forEach((r) => items.push(item('agent', { ...r, quoted: false }, { what: 'Survey waiting on the estate agent to confirm', actions: ['open', 'call', 'date'] })));
  /* The board's rule (lib/surveys.js): red 24 hours after the survey ends. */
  ext.reports.forEach((r) => items.push(item('reports', { ...r, quoted: false }, { what: `Paid, report not sent (${r.days} day${r.days === 1 ? '' : 's'})`,
    overdue: r.late, actions: ['open', 'report'] })));
  ext.remedial.forEach((r) => items.push(item('remedial', { ...r, quoted: false }, { what: 'Report sent, no decision on remedial work', actions: ['open', 'remedial'] })));
  ext.deposits.forEach((r) => items.push(r.quotedDeposit
    ? item('deposits', r, { what: 'Quote accepted, no deposit taken yet', actions: ['open', 'call'] })
    : item('deposits', { ...r, quoted: false }, { what: `Deposit not taken for the ${niceDay(r.date)} survey`, actions: ['open', 'call', 'deposit', 'paid'] })));
  for (const o of own) {
    const late = age(o.jobDate, today) > INVOICE_OVERDUE_DAYS;
    items.push(item(late ? 'invoices' : 'payments', { ...o, date: o.jobDate }, { what: late ? `Unpaid ${age(o.jobDate, today)} days after the work` : 'Work done, not paid in full',
      owedPence: o.owedPence, overdue: late, actions: o.quoted ? ['open', 'call'] : ['open', 'call', 'paid'] }));
  }
  pay.ready.forEach((p) => items.push(item('payouts', { ...p, date: p.jobDate }, { what: 'Paid in full, payout ready to freeze', owedPence: p.owedPence })));
  pay.drifted.forEach((p) => items.push(item('payouts', { ...p, date: p.jobDate }, { what: 'Frozen payout moved by a late line', owedPence: p.driftPence })));
  const want = new Set(sites);
  for (const t of todos) {
    if (t.site && !want.has(t.site)) continue;
    if (!t.site && sites.length < scope.businesses.length && scope.businesses.length > 0 && t.jobId == null) continue;
    items.push({ group: 'todos', key: `todo-${t.id}`, id: t.id, jobId: t.jobId, site: t.site, firstName: t.customer ? first(t.customer) : null, postcode: null,
      date: t.dueOn, what: t.text, forName: t.forName, overdue: t.overdue, actions: t.jobId ? ['todo', 'open'] : ['todo'] });
  }
  for (const s of svc) {
    if (s.daysUntilDue > 7) continue;
    items.push({ group: 'services', key: `service-${s.id}`, id: s.id, jobId: s.jobId, site: s.site, firstName: first(s.customerName), postcode: s.postcode, date: s.nextDueOn,
      what: s.daysUntilDue < 0 ? `Service ${-s.daysUntilDue} days overdue` : 'Service due', lastContactedOn: s.lastContactedOn || null, overdue: s.daysUntilDue < 0, message: s.message, quoted: true,
      actions: s.message ? ['open', 'message', 'contacted'] : ['contacted'] });
  }
  /* One line per job: the soonest unit to run out speaks for it. */
  ending.filter((u, i) => ending.findIndex((x) => x.jobId === u.jobId) === i).forEach((u) => items.push(item('warranty', { id: u.jobId, site: u.site, status: u.status, customerName: u.customerName, postcode: u.postcode, date: u.warrantyUntil },
    { what: `Warranty ends ${u.warrantyUntil}: ${[u.make, u.model].filter(Boolean).join(' ') || u.side + ' unit'}${u.location ? ` (${u.location})` : ''}`, actions: ['open', 'call'] })));
  budget.filter((b) => b.status !== 'paid').forEach((b) => items.push(item('budget', { ...b, date: b.jobDate }, { what: `Costs at ${Math.round(b.spentBp / 100)}% of the price`, actions: ['open'] })));

  const nums = await phones([...new Set(items.filter((i) => i.jobId && i.group !== 'enquiries').map((i) => i.jobId))]);
  for (const i of items) {
    if (i.jobId && i.phone === undefined) i.phone = nums.get(i.jobId) || null;
    i.whatsapp = mobileFor(i.phone) ? `https://wa.me/${mobileFor(i.phone)}` : null;
  }
  const groups = GROUPS.map(([key, label]) => ({ key, label, items: items.filter((i) => i.group === key).slice(0, LIMIT) }))
    .map((g) => ({ ...g, count: g.items.length })).filter((g) => g.count);
  return { today, money: moneySites.length > 0, total: groups.reduce((s, g) => s + g.count, 0), groups };
}

/** job id -> the groups it appears in, for the badges on the calendar. */
export function flagsByJob(work) {
  const map = new Map();
  for (const g of work.groups) for (const i of g.items) if (i.jobId) map.set(i.jobId, [...new Set([...(map.get(i.jobId) || []), g.key])]);
  return map;
}
