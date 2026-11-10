/**
 * A half-finished ATi or DampScan form becomes a Scheduling card by itself
 * (the owners' choice, 10 Nov 2026): nobody who gave a name and a way to
 * reach them is lost because they stopped part way. After half an hour with
 * no finished form from the same visit, email or phone (and no booking for
 * them), it goes into New, flagged "Didn't finish the form", with what they
 * did fill in and one alert. If they come back and finish in the same visit,
 * the full form fills in the same card; from another visit, the merge folds
 * them together (lib/merge-dupes.js).
 */
import { query } from './db.js';
import { notify } from './notify.js';
import { brandName, customer, page } from './alert-words.js';

const DAMP = ['dampscan', 'ati-london'];
const digits = (col) => `regexp_replace(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), '^44', '0')`;

export async function cardPartials(site = null) {
  const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: 'Didn\'t finish the website form: added to Scheduling automatically.' };
  const made = await query(
    `update leads l set stage = 'complete', sched_stage = 'new', from_partial = true, updated_at = now(),
            sched_log = coalesce(l.sched_log, '[]'::jsonb) || $3::jsonb
      where l.site = any($1::text[]) and ($2::text is null or l.site = $2) and l.stage = 'partial' and l.closed_at is null
        and l.created_at < now() - interval '30 minutes' and l.created_at > now() - interval '7 days'
        and (coalesce(l.email, '') <> '' or coalesce(l.phone, '') <> '')
        and not exists (select 1 from leads c where c.site = l.site and c.id <> l.id and c.stage = 'complete'
              and (c.session_id = l.session_id or (coalesce(l.email, '') <> '' and lower(c.email) = lower(l.email))
                   or (length(${digits('l.phone')}) > 6 and ${digits('c.phone')} = ${digits('l.phone')})))
        and not exists (select 1 from jobs j where j.site = l.site and j.created_at > now() - interval '60 days'
              and ((coalesce(l.email, '') <> '' and lower(j.customer_email) = lower(l.email))
                   or (length(${digits('l.phone')}) > 6 and ${digits('j.customer_phone')} = ${digits('l.phone')})))
      returning l.id, l.site, l.first_name, l.postcode, l.partial_alerted_at`, [DAMP, site, JSON.stringify([note])]);
  for (const l of made) {
    /* One alert, unless the old half-finished alert already went for this one. */
    if (l.partial_alerted_at) continue;
    await query('update leads set partial_alerted_at = now() where id = $1', [l.id]);
    await notify({
      business: l.site, kind: 'lead_partial', ref: l.id, tags: 'hourglass', priority: 3, path: page('schedule.html', l.site, `#lead-${l.id}`),
      title: `Didn't finish the form: ${brandName(l.site)}`,
      message: `${customer(l.first_name, l.postcode, ' in ')} started a booking but stopped part way. Now on Scheduling in New: give them a call.`
    });
  }
  return made.length;
}
