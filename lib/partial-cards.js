/**
 * A half-finished ATi or DampScan form becomes a Scheduling card by itself
 * (the owners' choice, 10 Nov 2026): nobody who gave a name and a way to
 * reach them is lost because they stopped part way. After half an hour, it
 * goes into New, flagged "Didn't finish the form", with one alert. If the
 * same person is already on the board or has a job card waiting (lib/same-
 * person.js: email, phone, or first name and postcode), it is merged into
 * that card instead: any detail the card lacked is filled in, the history
 * says so, and the half-finished form closes as a duplicate. Never two cards.
 */
import { query } from './db.js';
import { notify } from './notify.js';
import { brandName, customer, page } from './alert-words.js';
import { sameParams, sameSql, LEAD, JOB, FILL } from './same-person.js';

const DAMP = ['dampscan', 'ati-london'];
const note = (text) => JSON.stringify([{ at: new Date().toISOString(), by: 'Website', how: 'note', note: text }]);

async function mergeInto(p) {
  const params = [p.site, p.id, p.session_id, ...sameParams({ email: p.email, phone: p.phone, name: p.first_name, postcode: p.postcode })];
  const card = (await query(`select l.id from leads l where l.site = $1 and l.id <> $2 and l.stage = 'complete' and l.closed_at is null
        and not exists (select 1 from jobs j where j.lead_id = l.id)
        and (l.session_id = $3 or ${sameSql(LEAD('l'), 4)}) order by l.created_at desc limit 1`, params))[0];
  if (card) {
    await query(`update leads set ${FILL} where id = $1`, [card.id, p.phone || null, p.email || null, p.postcode || null, p.address_line1 || null]);
    await query("update leads set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1", [card.id, note('Started the website form again but did not finish it; merged in here.')]);
    await query("update leads set closed_at = now(), closed_reason = 'Duplicate: merged into their card', merged_into = $2 where id = $1", [p.id, card.id]);
    return true;
  }
  const job = (await query(`select j.id from jobs j left join leads l on l.id = j.lead_id
      where j.site = $1 and j.status = 'booked' and j.created_at > now() - interval '60 days' and ${sameSql(JOB('j', 'l'), 2)}
      order by j.id desc limit 1`, [p.site, ...params.slice(3)]))[0];
  if (job) {
    await query("update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1", [job.id, note('Started the website form again but did not finish it.')]);
    await query("update leads set closed_at = now(), closed_reason = 'Duplicate: already has a job card' where id = $1", [p.id]);
    return true;
  }
  return false;
}

export async function cardPartials(site = null) {
  const waiting = await query(
    `select id, site, session_id, first_name, email, phone, postcode, address_line1, partial_alerted_at from leads
      where site = any($1::text[]) and ($2::text is null or site = $2) and stage = 'partial' and closed_at is null
        and created_at < now() - interval '30 minutes' and created_at > now() - interval '7 days'
        and (coalesce(email, '') <> '' or coalesce(phone, '') <> '')
      order by created_at`, [DAMP, site]);
  let made = 0;
  for (const p of waiting) {
    if (await mergeInto(p)) continue;
    const [row] = await query(`update leads set stage = 'complete', sched_stage = 'new', from_partial = true, updated_at = now(),
        sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1 and stage = 'partial' returning id`,
      [p.id, note('Didn\'t finish the website form: added to Scheduling automatically.')]);
    if (!row) continue;
    made += 1;
    /* One alert, unless the old half-finished alert already went for this one. */
    if (p.partial_alerted_at) continue;
    await query('update leads set partial_alerted_at = now() where id = $1', [p.id]);
    await notify({
      business: p.site, kind: 'lead_partial', ref: p.id, tags: 'hourglass', priority: 3, path: page('schedule.html', p.site, `#lead-${p.id}`),
      title: `Didn't finish the form: ${brandName(p.site)}`,
      message: `${customer(p.first_name, p.postcode, ' in ')} started a booking but stopped part way. Now on Scheduling in New: give them a call.`
    });
  }
  return made;
}
