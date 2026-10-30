/**
 * The damp survey board: where each ATi and DampScan survey stands, the rule
 * for a report that is late, and the remedial follow-on after it.
 *
 * A survey's column is derived, never stored, from the facts the client card
 * already keeps (the date, the paid and report ticks), so the board, the
 * client cards and Today can never disagree about a job. The order is the
 * owners': the customer pays before the report goes.
 *
 *   enquiry    a finished web enquiry with no job yet (read from leads)
 *   booked     a date to come; a survey waiting on an estate agent to confirm
 *              the time stays here with a badge, it is the exception
 *   surveyed   the date has passed (or it was marked done), not paid in full
 *   paid       paid in full, report not sent yet
 *   sent       the report has gone: finished, the archive
 *
 * A report is late 24 hours after the survey ends (its start plus the rate
 * card's minutes on site; an untimed survey ends with its day). The board,
 * Today, Reports and the overdue alert all read REPORT_DEADLINE below, so
 * every red turns at the same moment.
 */
import { query } from './db.js';
import { TODAY } from './today.js';
import { isoDate } from './routes/admin/clients.js';
import { contactOf } from './contact-note.js';

export const DAMP_SITES = ['dampscan', 'ati-london'];
export const STAGES = ['enquiry', 'booked', 'surveyed', 'paid', 'sent'];
/* A report sent this long ago with no word on remedial work earns a nudge. */
export const REMEDIAL_NUDGE_DAYS = 3;
export const REMEDIAL_STATUSES = ['none', 'quoting', 'won', 'declined'];

const DONE = `(not j.awaiting_agent and (j.status = 'completed' or j.job_date < ${TODAY}))`;
/* When the survey ends: start plus the rate card's minutes, or the end of an untimed day. */
export const SURVEY_END = `(case when j.job_time is not null
    then ((j.job_date + j.job_time) at time zone 'Europe/London')
      + make_interval(mins => coalesce((select rr.duration_min from job_rates rr where rr.key = j.survey_type), 60))
    else ((j.job_date + 1)::timestamp at time zone 'Europe/London') end)`;
export const REPORT_DEADLINE = `(${SURVEY_END} + interval '24 hours')`;
/* Unsent and past the deadline: the one rule for red. */
export const REPORT_LATE = `(j.survey_sent_at is null and not j.awaiting_agent and ${REPORT_DEADLINE} < now())`;
export const STAGE_SQL = `case
    when j.survey_sent_at is not null then 'sent'
    when ${DONE} and j.paid_at is not null then 'paid'
    when ${DONE} then 'surveyed'
    else 'booked' end`;

/* Surveyed and paid, no report: recent enough to still be owed. */
export const REPORT_DUE = `(j.survey_sent_at is null and j.paid_at is not null and j.status <> 'cancelled' and ${DONE}
    and j.job_date >= ${TODAY} - 90)`;
/* Days the report has been owed: from the survey or the payment, whichever was later. */
export const REPORT_DAYS = `(${TODAY} - greatest(j.job_date, (j.paid_at at time zone 'Europe/London')::date))`;

/* Report out a few days, nothing decided about remedial work yet. */
export const REMEDIAL_DUE = `(j.survey_sent_at is not null and j.remedial_status = 'none' and j.status <> 'cancelled'
    and j.survey_sent_at < now() - interval '${REMEDIAL_NUDGE_DAYS} days' and j.survey_sent_at >= now() - interval '60 days')`;

const SELECT = `
  select j.id, j.site, j.lead_id, j.status, j.job_date, j.job_time, j.awaiting_agent, j.surveyor, j.survey_type,
         j.survey_price_pence, j.remedial_pence, j.remedial_status, j.remedial_quote_pence, j.note,
         j.deposit_paid_at, j.paid_at, j.survey_sent_at, j.estate_agent_id, j.customer_address, j.report_name,
         (select count(*) from todos t where t.job_id = j.id and t.done_at is null)::int as todo_count,
         ${REPORT_DEADLINE} as report_deadline, ${REPORT_LATE} as report_late,
         coalesce(j.customer_name, l.first_name) as name, coalesce(j.customer_postcode, l.postcode) as postcode,
         coalesce(j.customer_phone, l.phone) as phone, coalesce(j.customer_email, l.email) as email,
         l.address_line1, l.address_line2, l.town, l.notes as lead_notes,
         r.label as survey_label, a.name as agent_name, a.branch as agent_branch, a.phone as agent_phone, a.email as agent_email,
         ${STAGE_SQL} as stage, ${REPORT_DAYS} as days_since,
         ${REPORT_DUE} as report_due, ${REMEDIAL_DUE} as remedial_due
    from jobs j
    left join leads l on l.id = j.lead_id
    left join job_rates r on r.key = j.survey_type
    left join estate_agents a on a.id = j.estate_agent_id`;

const firstName = (n) => String(n || '').trim().split(/\s+/).find((w) => !/^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(w)) || null;

/** One survey as the board, the day sheet and the assistant see it. */
export function toSurvey(r) {
  const price = Number(r.survey_price_pence) || 0;
  const days = r.days_since == null ? null : Number(r.days_since);
  return {
    id: Number(r.id), site: r.site, leadId: r.lead_id == null ? null : Number(r.lead_id), stage: r.stage, status: r.status,
    date: isoDate(r.job_date), time: r.job_time ? String(r.job_time).slice(0, 5) : null, awaitingAgent: Boolean(r.awaiting_agent),
    name: r.name || null, firstName: firstName(r.name), postcode: r.postcode || null, ...contactOf(r.phone || null, r.email || null, r.note),
    address: r.customer_address ? [r.customer_address, r.postcode].filter(Boolean).join(', ')
      : [r.address_line1, r.address_line2, r.town, r.postcode].filter(Boolean).join(', ') || null,
    street: r.customer_address || [r.address_line1, r.town].filter(Boolean).join(', ') || r.postcode || null,
    surveyor: r.surveyor, surveyType: r.survey_type, surveyLabel: r.survey_label || r.survey_type || 'One off',
    pricePence: price, depositPence: Math.ceil(price / 2),
    deposit: Boolean(r.deposit_paid_at), paid: Boolean(r.paid_at), reportSent: Boolean(r.survey_sent_at), reportSentAt: r.survey_sent_at,
    /* The 24 hours to send the report run from the survey's end (REPORT_DEADLINE). */
    reportDeadline: !r.awaiting_agent && !r.survey_sent_at && !['cancelled', 'declined'].includes(r.status) && r.report_deadline ? new Date(r.report_deadline).toISOString() : null,
    reportFile: r.report_name || null, todoCount: r.todo_count || 0,
    reportDays: r.report_due ? days : null, reportLate: Boolean(r.report_due) && Boolean(r.report_late),
    remedial: { status: r.remedial_status || 'none', quotePence: r.remedial_quote_pence == null ? null : Number(r.remedial_quote_pence),
      wonPence: Number(r.remedial_pence) || 0, nudge: Boolean(r.remedial_due) },
    agent: r.estate_agent_id ? { id: Number(r.estate_agent_id), name: r.agent_name, branch: r.agent_branch, phone: r.agent_phone, email: r.agent_email } : null,
    note: r.note || null, leadNotes: r.lead_notes || null
  };
}

/** One survey by id, in these sites, or null. */
export async function surveyById(id, sites) {
  const rows = await query(`${SELECT} where j.id = $1 and j.site = any($2::text[])`, [id, sites]);
  return rows[0] ? toSurvey(rows[0]) : null;
}

/** The whole board for these sites: enquiries, then every survey not cancelled. Paid stays 90 days. */
export async function board(sites) {
  const [jobs, leads] = await Promise.all([
    query(`${SELECT}
      where j.site = any($1::text[]) and j.status <> 'cancelled'
        and not (j.survey_sent_at is not null and j.survey_sent_at < now() - interval '90 days')
      order by j.job_date, j.job_time nulls last, j.id limit 600`, [sites]),
    query(`select l.id, l.site, l.created_at, l.first_name, l.postcode, l.phone, l.email, l.issues,
                  l.address_line1, l.town
             from leads l
            where l.site = any($1::text[]) and l.stage = 'complete' and l.created_at >= now() - interval '60 days'
              and l.closed_at is null and not exists (select 1 from jobs j where j.lead_id = l.id)
            order by l.created_at desc limit 200`, [sites])
  ]);
  const enquiries = leads.map((l) => ({
    leadId: Number(l.id), site: l.site, stage: 'enquiry', createdAt: l.created_at, firstName: l.first_name || null,
    name: l.first_name || null, postcode: l.postcode || null, phone: l.phone || null,
    email: l.email || null, street: [l.address_line1, l.town].filter(Boolean).join(', ') || null, issues: l.issues || []
  }));
  return { enquiries, surveys: jobs.map(toSurvey) };
}

/** A surveyor's day, in the order they will drive it: timed first, then the rest. */
export async function daySheet(sites, date, surveyor) {
  const rows = await query(`${SELECT}
      where j.site = any($1::text[]) and j.status <> 'cancelled' and j.job_date = $2::date
        and ($3::text is null or j.surveyor = $3)
      order by j.job_time nulls last, j.id`, [sites, date, surveyor || null]);
  return rows.map(toSurvey);
}

/** Every survey done whose report has not gone, oldest first: the Reports page. */
export async function reportsOwed(sites) {
  const rows = await query(`${SELECT}
      where j.site = any($1::text[]) and j.status not in ('cancelled', 'declined') and j.survey_sent_at is null
        and (j.job_date < ${TODAY} or j.status = 'completed' or ${SURVEY_END} <= now())
        and j.job_date >= ${TODAY} - 120 and not j.awaiting_agent
      order by j.job_date, j.job_time nulls last, j.id limit 200`, [sites]);
  return rows.map(toSurvey);
}

export { SELECT as SURVEY_SELECT };
