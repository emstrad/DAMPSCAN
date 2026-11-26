/**
 * How far a customer got on the damp booking form, told to the team straight
 * away (the owner, 26 Nov 2026: "at the minute we have to go searching for it
 * on the client card"). The enquiry alert already goes when they send their
 * details, and a time picked or booked has its own alert (lib/web-booking.js).
 * This adds the two ends that said nothing: "Call me" on the times tapped, and
 * the times shown but none picked. Each is a line in their history and one
 * alert, once per enquiry (leads.form_outcome).
 */
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { brandName, customer, staffBase } from './alert-words.js';
import { logContact, DAMP } from './scheduling.js';

/* Ten minutes on the times with nothing picked: gone, or gone to make a cup of tea. */
export const LEFT_AFTER_MIN = 10;

const choiceOf = (l) => {
  const c = typeof l.survey_choice === 'string' ? JSON.parse(l.survey_choice) : l.survey_choice;
  if (!c) return 'no survey chosen yet';
  if (c.unsure || !c.price) return c.name ? c.name.toLowerCase() : 'not sure which survey';
  return `${c.name} (${c.from ? 'from ' : ''}£${c.price})`;
};
const telOf = (p) => { const n = String(p || '').replace(/[^\d+]/g, '').replace(/^\+44/, '0'); return /^0\d{10}$/.test(n) ? n : null; };

/** They reached the times (step 3): kept so the sweep knows they were there. */
export async function reachedTimes(leadId) {
  await query(`update leads set form_step = greatest(coalesce(form_step, 0), 3), form_step_at = now() where id = $1`, [Number(leadId) || 0]).catch(() => {});
}

/** Where they ended, once: 'call', 'left', 'picked' (a time asked for or booked), or 'sent' (no times for them). */
export async function recordOutcome(leadId, what, { sessionId = null } = {}) {
  const l = await queryOne(`update leads set form_outcome = $2, form_outcome_at = now()
      where id = $1 and form_outcome is null and stage = 'complete' ${sessionId ? 'and session_id = $3::uuid' : ''}
      returning id, site, first_name, postcode, phone, survey_choice`,
    sessionId ? [Number(leadId) || 0, what, String(sessionId)] : [Number(leadId) || 0, what]).catch(() => null);
  if (!l || !DAMP.includes(l.site)) return { ok: Boolean(l) };
  if (what !== 'call' && what !== 'left') return { ok: true };
  const who = customer(l.first_name, l.postcode, ' in ');
  const note = what === 'call' ? `Asked us to call to arrange a time on the website. Chose: ${choiceOf(l)}.`
    : `Saw the times on the website but did not pick one. Chose: ${choiceOf(l)}.`;
  await logContact('lead', Number(l.id), { at: new Date().toISOString(), by: 'Website', how: 'note', note }, { moveOn: false });
  const tel = telOf(l.phone), path = `/schedule.html#lead-${l.id}`;
  await notify({ business: l.site, kind: 'enquiry', ref: Number(l.id), tags: 'telephone_receiver', priority: 4, path,
    actions: [...(tel ? [{ action: 'view', label: 'Call', url: `tel:${tel}` }] : []), { action: 'view', label: 'Open', url: staffBase() + path }],
    title: `${what === 'call' ? 'Wants a call' : 'Did not pick a time'}: ${brandName(l.site)}`,
    message: `${who} ${what === 'call' ? 'asked us to call to arrange a time' : 'saw the times but did not pick one'}. Chose ${choiceOf(l)}.` });
  return { ok: true };
}

/** From the every-minute run: anyone on the times this long with nothing picked, booked or asked for. */
export async function sweepLeft() {
  const rows = await query(`select l.id from leads l
      where l.form_step = 3 and l.form_outcome is null and l.stage = 'complete' and l.closed_at is null
        and l.pencil_date is null and l.form_step_at < now() - make_interval(mins => $1) and l.form_step_at > now() - interval '1 day'
        and not exists (select 1 from jobs j where j.lead_id = l.id)
      limit 10`, [LEFT_AFTER_MIN]).catch(() => []);
  for (const r of rows) await recordOutcome(r.id, 'left');
  return rows.length;
}
