/**
 * What booked customers asked from their own page that nobody has answered
 * yet (the owner's ask, 15 Nov 2026), for Scheduling's "Needs you now": a move
 * asked for while the survey is still where it was, and a message with nothing
 * logged by the team since, and a cancelled survey asking to book again (lib/portal-rebook.js). Logging the reply (a call, text or note on their
 * card) or moving it takes it off.
 */
import { query } from './db.js';

const SAID = 'They wrote on their page: ';
const hhmm = (t) => String(t || '').slice(0, 5);

export function askOf(j) {
  const m = j.move_request;
  if (m && m.date && m.from === `${j.day} ${hhmm(j.job_time)}`) return { what: m.rebook ? 'rebook' : 'move', date: m.date, time: m.time, at: m.at || null };
  const log = Array.isArray(j.sched_log) ? j.sched_log : [];
  let last = -1;
  log.forEach((e, i) => { if (e && e.by !== 'Their page') last = i; });
  const said = log.slice(last + 1).filter((e) => e && String(e.note || '').startsWith(SAID));
  if (!said.length) return null;
  const latest = said[said.length - 1];
  /* The short line is for lists; the card shows every word they wrote (20 Nov 2026: Danya's message was cut at 120). */
  const whole = String(latest.note).slice(SAID.length);
  return { what: 'message', text: whole.slice(0, 120), full: whole, at: latest.at || null, count: said.length };
}

export async function pageAsks(sites) {
  const rows = await query(`select id, site, customer_name, customer_postcode, job_date::text as day, job_time, move_request, sched_log from jobs
      where site = any($1::text[]) and site in ('dampscan', 'ati-london') and status in ('booked', 'completed', 'cancelled')
        and (move_request is not null or sched_log::text like '%They wrote on their page%')
        and (job_date is null or job_date >= current_date - 30)
      order by id desc limit 200`, [sites]).catch(() => []);
  return rows.map((j) => ({ id: Number(j.id), site: j.site, name: j.customer_name, postcode: j.customer_postcode, ask: askOf(j) })).filter((a) => a.ask);
}
