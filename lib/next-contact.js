/**
 * When to get back to a customer next (the owners' choice, 10 Nov 2026: one
 * list, one next step per customer). Every call, email or text logged sets
 * it: two working days by default, or Tomorrow, Next week, a date or No
 * follow-up. An email from them is due today ("Reply to their email"); one
 * from us waits two working days. Due ones join the one to-do list
 * (lib/work.js), "Customers who need something" and Scheduling's "Needs you
 * now". Kept on leads and undated job cards (next_contact_on, next_contact_why).
 */
import { query } from './db.js';
import { londonToday } from './pipeline.js';

const TABLE = { lead: 'leads', job: 'jobs' };
export const CONTACT = ['call', 'email', 'text'];
export const CHOICES = ['tomorrow', '2days', 'week', 'none'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const iso = (d) => d.toISOString().slice(0, 10);
const at = (day) => new Date(`${day}T12:00:00Z`);

/** n working days after `from` (weekends skipped). */
export function workingDays(n, from = londonToday()) {
  const d = at(from);
  let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6) left -= 1; }
  return iso(d);
}

/** A chip or date to a day, null for No follow-up, undefined when not understood. */
export function dayFor(choice, today = londonToday()) {
  if (choice === 'none' || choice === null) return null;
  if (choice === 'tomorrow') return workingDays(1, today);
  if (choice === undefined || choice === '' || choice === '2days') return workingDays(2, today);
  if (choice === 'week') { const d = at(today); d.setUTCDate(d.getUTCDate() + 7); return iso(d); }
  if (DATE.test(String(choice)) && !Number.isNaN(Date.parse(choice))) return String(choice);
  return undefined;
}

/**
 * What a logged entry sets: an email from them is a reply due today; any
 * other call, email or text follows `choice` (two working days by default).
 * A plain note changes nothing unless a choice was made.
 */
export function nextFor(entry, choice, today = londonToday()) {
  if (entry.how === 'email' && entry.dir === 'in' && choice === undefined) return { on: today, why: 'Reply to their email' };
  if (!CONTACT.includes(entry.how) && choice === undefined) return undefined;
  const on = dayFor(choice, today);
  if (on === undefined) return undefined;
  return { on, why: on ? 'Follow up' : null };
}

export async function setNext(kind, id, next) {
  if (!TABLE[kind] || next === undefined) return;
  await query(`update ${TABLE[kind]} set next_contact_on = $2::date, next_contact_why = $3 where id = $1`, [id, next ? next.on : null, next ? next.why : null]);
}

/** Customers whose next contact has come, for the one list. */
export async function dueFollowUps(sites, today = londonToday()) {
  return query(`select 'lead' as kind, l.id, l.site, l.first_name as name, l.postcode, l.phone, l.next_contact_on::text as on, l.next_contact_why as why
       from leads l where l.site = any($1::text[]) and l.stage = 'complete' and l.closed_at is null and l.next_contact_on <= $2::date
        and not exists (select 1 from jobs j where j.lead_id = l.id)
     union all
     select 'job', j.id, j.site, coalesce(j.customer_name, l.first_name), coalesce(j.customer_postcode, l.postcode), coalesce(j.customer_phone, l.phone),
            j.next_contact_on::text, j.next_contact_why
       from jobs j left join leads l on l.id = j.lead_id
      where j.site = any($1::text[]) and j.status = 'booked' and not j.date_set and j.next_contact_on <= $2::date
     order by 7 limit 60`, [sites, today]);
}
