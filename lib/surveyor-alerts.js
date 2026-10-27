/**
 * Each surveyor's own ntfy feed (the owners' choice): the owners keep the
 * main topic with everything; Ben and Ronnie (and Tom, if he wants one) each
 * have a topic of their own that only says what touches their diary: a
 * survey booked for them, moved, taken off them or cancelled, and a time a
 * customer or a colleague has pencilled in for them. Set NTFY_TOPIC_BEN,
 * NTFY_TOPIC_RONNIE, NTFY_TOPIC_TOM; no topic, nothing sent.
 *
 * Lock-screen rule as everywhere: first name and postcode district, no money.
 * What the feed was last told is kept on the job (surveyor_told), so a save
 * that changes nothing about the visit says nothing, and every route (the
 * staff area, ChatGPT, Scheduling) is covered from one place.
 */
import { query, queryOne } from './db.js';
import { push } from './notify.js';
import { customer, staffBase } from './alert-words.js';
import { offerFreedSlot } from './cancel-fill.js';
import { textJob } from './sms.js';

const DAMP = ['dampscan', 'ati-london'];
export const topicFor = (surveyor) => (surveyor ? (process.env[`NTFY_TOPIC_${String(surveyor).toUpperCase()}`] || '').trim() : '') || null;
const nice = (d, t) => `${new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}${t ? ' at ' + String(t).slice(0, 5) : ', time to be agreed'}`;

async function tell(surveyor, title, message, path) {
  const topic = topicFor(surveyor);
  if (!topic) return false;
  return push({ topic, title, message, tags: 'calendar', priority: 4, click: staffBase() + (path || '/day.html') });
}

/** After any change to a job: tells the surveyor(s) whose diary it changed. */
export async function tellSurveyors(jobId) {
  const j = await queryOne(`select j.id, j.site, j.status, j.date_set, j.job_date::text as date, to_char(j.job_time, 'HH24:MI') as time, j.surveyor, j.surveyor_told,
      j.customer_name, j.customer_postcode, r.label from jobs j left join job_rates r on r.key = j.survey_type where j.id = $1`, [jobId]);
  if (!j || !DAMP.includes(j.site)) return;
  const live = ['booked', 'completed'].includes(j.status) && j.date_set && j.surveyor;
  const now = live ? `${j.surveyor}|${j.date}|${j.time || ''}` : null;
  if ((j.surveyor_told || null) === now) return;
  const [wasWho, wasDate, wasTime] = String(j.surveyor_told || '').split('|');
  const who = customer(j.customer_name, j.customer_postcode);
  const what = [j.label].filter(Boolean).join('');
  if (wasWho && (!now || wasWho !== j.surveyor || wasDate !== j.date || wasTime !== (j.time || ''))) {
    if (!now || wasWho !== j.surveyor) await tell(wasWho, j.status === 'cancelled' ? 'Survey cancelled' : 'Taken off your diary', `${who}, ${nice(wasDate, wasTime)}.`);
    /* The gap left is offered to the customers still waiting (lib/cancel-fill.js). */
    await offerFreedSlot({ surveyor: wasWho, date: wasDate, time: wasTime, site: j.site }).catch((err) => console.warn('gap offer failed:', err.message));
  }
  if (now) {
    const moved = wasWho === j.surveyor;
    await tell(j.surveyor, moved ? 'Survey moved' : 'Survey booked for you', `${who}, ${nice(j.date, j.time)}${what ? '. ' + what : ''}.`);
    /* The customer's confirmation text, once Twilio is switched on (lib/sms.js). */
    if (!wasWho) await textJob(j.id, 'confirm').catch(() => {});
  }
  await query('update jobs set surveyor_told = $2 where id = $1', [jobId, now]);
}

/** A time pencilled in for a surveyor, by a colleague or a customer on the website. */
export async function tellPencil({ surveyor, name, postcode, date, time, by }) {
  await tell(surveyor, by === 'Website' ? 'Time requested by a customer' : 'Time pencilled for you',
    `${customer(name, postcode)}, ${nice(date, time)}. Not confirmed yet.`, '/schedule.html');
}
