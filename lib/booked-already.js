/**
 * The same person already booked at the same property (the owner, 27 Nov 2026:
 * Quick book let an agent book Sam Patel twice for the same morning, with two
 * surveyors). A survey still to happen, matched by postcode and the same
 * mobile or email, within one business. A visit already done never blocks a
 * new one: that is the agent's "Book another visit here".
 */
import { queryOne } from './db.js';
import { normalisePostcode } from './validate.js';

const DIGITS = (col) => `regexp_replace(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), '^44', '0')`;
const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^44/, '0');

/** Their live survey here, or null: { id, day, time, said } (said reads "Mon 30 Nov at 09:00"). */
export async function bookedAlready({ site, postcode, phone, email }) {
  const pc = normalisePostcode(postcode), tel = digits(phone), mail = String(email || '').trim().toLowerCase();
  if (!pc || (!tel && !mail)) return null;
  const j = await queryOne(`select j.id, j.job_date::text as day, to_char(j.job_time, 'HH24:MI') as hhmm, j.date_set from jobs j
      left join leads l on l.id = j.lead_id
      where j.site = $1 and j.status = 'booked' and upper(replace(j.customer_postcode, ' ', '')) = upper(replace($2, ' ', ''))
        and (not j.date_set or j.job_date >= (now() at time zone 'Europe/London')::date)
        and (($3 <> '' and (${DIGITS('j.customer_phone')} = $3 or ${DIGITS('l.phone')} = $3))
          or ($4 <> '' and (lower(coalesce(j.customer_email, '')) = $4 or lower(coalesce(l.email, '')) = $4)))
      order by j.job_date nulls last limit 1`, [site, pc, tel, mail]).catch(() => null);
  if (!j) return null;
  const said = j.date_set && j.day
    ? `${new Date(j.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}${j.hhmm ? ' at ' + j.hhmm : ''}`
    : null;
  return { id: Number(j.id), day: j.day, time: j.hhmm, said };
}
