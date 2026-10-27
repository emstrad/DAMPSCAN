/**
 * The same person sending the form twice (a second go, or a different page)
 * is one customer, not two cards. When a finished enquiry arrives, any open
 * earlier one from the same email or phone in the same business, in the
 * last 60 days, is folded into it: its call log, the times they wanted and
 * any pencilled time move to the new one, which says so, and the old one
 * closes as a duplicate (it stays on the Leads page, pointing at the new).
 */
import { query } from './db.js';

export async function mergeDuplicates(id) {
  const fresh = (await query('select id, site, email, phone, sched_log, sched_wanted, pencil_date from leads where id = $1', [id]))[0];
  if (!fresh) return 0;
  const digits = String(fresh.phone || '').replace(/\D/g, '').replace(/^44/, '0');
  const old = await query(`select id, created_at, sched_log, sched_wanted, sched_stage, pencil_date, pencil_time, pencil_surveyor, pencil_until, pencil_by, pencil_set_at, pencil_forced
      from leads l where l.id <> $1 and l.site = $2 and l.stage = 'complete' and l.closed_at is null and l.created_at > now() - interval '60 days'
        and not exists (select 1 from jobs j where j.lead_id = l.id)
        and ((coalesce(l.email, '') <> '' and lower(l.email) = lower(coalesce($3, '')))
          or (length($4) > 6 and regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g') in ($4, '44' || substr($4, 2))))
      order by l.created_at`, [id, fresh.site, fresh.email || '', digits]);
  for (const o of old) {
    const day = new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: `Sent the form again; their earlier enquiry of ${day} is merged in here.` };
    await query(`update leads set sched_log = coalesce($2::jsonb, '[]'::jsonb) || coalesce(sched_log, '[]'::jsonb) || $3::jsonb,
        sched_wanted = coalesce(sched_wanted, $4), sched_stage = coalesce(sched_stage, $5) where id = $1`,
      [id, JSON.stringify(o.sched_log || []), JSON.stringify([note]), o.sched_wanted, o.sched_stage]);
    if (o.pencil_date && !fresh.pencil_date) {
      await query(`update leads set pencil_date = $2, pencil_time = $3, pencil_surveyor = $4, pencil_until = $5, pencil_by = $6, pencil_set_at = $7, pencil_forced = $8 where id = $1`,
        [id, o.pencil_date, o.pencil_time, o.pencil_surveyor, o.pencil_until, o.pencil_by, o.pencil_set_at, o.pencil_forced]);
    }
    await query(`update leads set closed_at = now(), closed_reason = 'Duplicate: sent the form again', merged_into = $2,
        pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null where id = $1`, [o.id, id]);
  }
  return old.length;
}
