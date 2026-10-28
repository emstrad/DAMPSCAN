/**
 * Two reads for Today (calendar.html) beyond the dated events:
 *
 * unbookedFor: work that is agreed but has no day anybody chose. A job always
 * holds a date (it defaults to the day it was made), so date_set (schema.sql)
 * tells a real date from a default; these sit in "Not booked in yet" rather
 * than on the day they happened to be typed in.
 *
 * jobFor: one job as Today's pop-up shows it, so a tap on the timeline can
 * show and act on everything about the job without leaving the page. Money is
 * only included for a business the person manages, as everywhere else.
 */
import { jobStage, settledTodos } from './journey.js';
import { query, queryOne } from './db.js';
import { unitsOf, planOfJob } from './coolright-kit.js';
import { contactOf } from './contact-note.js';

const day = (v) => (v == null ? null : String(v).slice(0, 10));
const hhmm = (v) => (v ? String(v).slice(0, 5) : null);

export async function unbookedFor(sites) {
  const rows = await query(
    `select j.id, j.site, j.status, j.job_date::text as job_date, j.customer_name, j.customer_postcode, b.payout_model
       from jobs j join businesses b on b.slug = j.site
      where j.site = any($1::text[]) and j.job_time is null
        and ((j.status = 'booked' and not j.date_set)
          or (j.status = 'quoted' and (j.quote_accepted_at is not null or j.won_at is not null) and not j.date_set))
      order by j.created_at desc limit 60`, [sites]);
  return rows.map((r) => ({ kind: 'job', id: Number(r.id), site: r.site, status: r.status, date: null, time: null,
    customerName: r.customer_name, postcode: r.customer_postcode, quoted: r.payout_model !== 'damp', dateSet: false }));
}

/* A survey booked by phone or by the assistant has no web enquiry, so its
   address lives on the job itself (customer_address); an enquiry's address is
   in its own fields. Reading only the enquiry left those jobs with no address
   and no way to navigate there. */
function addressOf(r) {
  const pc = r.customer_postcode || '';
  if (r.customer_address) {
    const a = String(r.customer_address).trim();
    return a.toUpperCase().replace(/\s/g, '').includes(pc.toUpperCase().replace(/\s/g, '')) ? [a] : [a, pc].filter(Boolean);
  }
  return [r.address_line1, r.address_line2, r.town, pc].filter(Boolean);
}

export async function jobFor(scope, sites, id) {
  const r = await queryOne(
    `select j.id, j.site, j.status, j.job_date::text as job_date, j.job_time, j.date_set, j.customer_name, j.customer_postcode,
            coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email, j.note, j.awaiting_agent, j.sched_stage,
            j.deposit_paid_at, j.paid_at, j.survey_sent_at, j.pencil_date, j.pencil_until, j.survey_price_pence, j.remedial_pence, j.invoice_net_pence,
            j.quote_accepted_at, j.won_at, j.commissioned_on::text as commissioned_on, j.commission_engineer, j.fgas_ref,
            j.leak_check_on::text as leak_check_on, j.pressure_test, l.address_line1, l.address_line2, l.town, b.payout_model, b.name as business_name,
            j.customer_address, j.surveyor, j.lead_id, r.label as survey_label, l.notes as lead_notes, l.issues as lead_issues, l.files as lead_files,
            a.name as agent_name, a.branch as agent_branch, a.phone as agent_phone, a.email as agent_email,
            coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) as received
       from jobs j join businesses b on b.slug = j.site left join leads l on l.id = j.lead_id
       left join job_rates r on r.key = j.survey_type left join estate_agents a on a.id = j.estate_agent_id
      where j.id = $1 and j.site = any($2::text[])`, [id, sites]);
  if (!r) return null;
  const money = scope.isAdmin || scope.levels[r.site] === 'manage';
  const damp = r.payout_model === 'damp';
  const todos = await query(
    `select t.id, t.text, t.due_on::text as due_on, p.name as for_name from todos t left join people p on p.id = t.for_person_id
      where t.job_id = $1 and t.done_at is null order by t.due_on nulls last, t.id limit 20`, [id]);
  const photos = await query('select id, path_thumb is not null as thumb, caption from job_photos where job_id = $1 order by id limit 60', [id]);
  const price = Number(r.survey_price_pence || 0) + Number(r.remedial_pence || 0);
  /* CoolRight's pop-up also shows the kit on the wall and the service plan. */
  const coolright = r.site === 'ac' ? {
    units: await unitsOf(Number(r.id)), plan: await planOfJob(Number(r.id)),
    commission: { commissionedOn: r.commissioned_on, engineer: r.commission_engineer, fgasRef: r.fgas_ref, leakCheckOn: r.leak_check_on, pressureTest: r.pressure_test }
  } : null;
  return {
    id: Number(r.id), site: r.site, business: r.business_name, status: r.status, quoted: !damp,
    date: day(r.job_date), time: hhmm(r.job_time), dateSet: Boolean(r.date_set), accepted: Boolean(r.quote_accepted_at || r.won_at),
    customerName: r.customer_name, postcode: r.customer_postcode, ...contactOf(r.phone, r.email, r.note), note: r.note,
    address: addressOf(r), surveyType: r.survey_label || null, surveyor: r.surveyor || null,
    agent: r.agent_name ? { name: r.agent_name, branch: r.agent_branch, phone: r.agent_phone, email: r.agent_email } : null,
    lead: r.lead_id ? { notes: r.lead_notes || null, issues: r.lead_issues || [] } : null,
    files: (r.lead_files || []).map((path) => ({ path, name: path.split('/').pop(), image: /\.(jpe?g|png|gif|webp|heic)$/i.test(path) })),
    photos: photos.map((p) => ({ id: Number(p.id), thumb: p.thumb, caption: p.caption })),
    awaitingAgent: Boolean(r.awaiting_agent), depositPaid: Boolean(r.deposit_paid_at), paid: Boolean(r.paid_at), reportSent: Boolean(r.survey_sent_at),
    money: money ? (damp ? { pricePence: price, depositPence: Math.ceil(Number(r.survey_price_pence || 0) / 2) }
      : { pricePence: Number(r.invoice_net_pence || 0), receivedPence: Number(r.received) }) : null,
    coolright, stage: damp ? jobStage(r) : null,
    /* To-dos that look done now, offered to clear (never cleared without asking). */
    maybeDone: await settledTodos(Number(r.id)),
    todos: todos.map((t) => ({ id: Number(t.id), text: t.text, dueOn: t.due_on, forName: t.for_name }))
  };
}
