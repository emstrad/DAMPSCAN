/**
 * The same person sending the form twice (a second go, or a different page)
 * is one customer, not two cards. When a finished enquiry arrives, any open
 * earlier one from the same email or phone in the same business, in the
 * last 60 days, is folded into it: its call log, the times they wanted and
 * any pencilled time move to the new one, which says so, and the old one
 * closes as a duplicate (it stays on the Leads page, pointing at the new).
 */
import { query } from './db.js';

/* Only the damp sites work customers on Scheduling; Verge and CoolRight keep their own pipelines. */
const DAMP = ['dampscan', 'ati-london'];

export async function mergeDuplicates(id) {
  const fresh = (await query('select id, site, email, phone, first_name, sched_log, sched_wanted, pencil_date from leads where id = $1', [id]))[0];
  if (!fresh || !DAMP.includes(fresh.site)) return 0;
  const digits = String(fresh.phone || '').replace(/\D/g, '').replace(/^44/, '0');
  const old = await query(`select id, created_at, sched_log, sched_wanted, sched_stage, pencil_date, pencil_time, pencil_surveyor, pencil_until, pencil_by, pencil_set_at, pencil_forced,
             estate_agent_id, survey_choice, files
      from leads l where l.id <> $1 and l.site = $2 and l.stage = 'complete' and l.closed_at is null and l.created_at > now() - interval '60 days'
        and not exists (select 1 from jobs j where j.lead_id = l.id)
        and ((coalesce(l.email, '') <> '' and lower(l.email) = lower(coalesce($3, '')))
          or (length($4) > 6 and regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g') in ($4, '44' || substr($4, 2))))
      order by l.created_at`, [id, fresh.site, fresh.email || '', digits]);
  for (const o of old) {
    const day = new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: `Sent the form again; their earlier enquiry of ${day} is merged in here.` };
    await query(`update leads set sched_log = coalesce($2::jsonb, '[]'::jsonb) || coalesce(sched_log, '[]'::jsonb) || $3::jsonb,
        sched_wanted = coalesce(sched_wanted, $4), sched_stage = coalesce(sched_stage, $5),
        estate_agent_id = coalesce(estate_agent_id, $6), survey_choice = coalesce(survey_choice, $7::jsonb),
        files = case when cardinality(files) > 0 then files else coalesce($8::text[], files) end where id = $1`,
      [id, JSON.stringify(o.sched_log || []), JSON.stringify([note]), o.sched_wanted, o.sched_stage,
        o.estate_agent_id, o.survey_choice ? JSON.stringify(o.survey_choice) : null, o.files || null]);
    if (o.pencil_date && !fresh.pencil_date) {
      await query(`update leads set pencil_date = $2, pencil_time = $3, pencil_surveyor = $4, pencil_until = $5, pencil_by = $6, pencil_set_at = $7, pencil_forced = $8 where id = $1`,
        [id, o.pencil_date, o.pencil_time, o.pencil_surveyor, o.pencil_until, o.pencil_by, o.pencil_set_at, o.pencil_forced]);
    }
    await query(`update leads set closed_at = now(), closed_reason = 'Duplicate: sent the form again', merged_into = $2,
        pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null where id = $1`, [o.id, id]);
  }
  if (!old.length) return foldIntoJob(fresh, digits);
  return old.length;
}

/* The same person sending the form again while their job card has no date yet:
   noted on that card, and this enquiry closed, so there is never a second card. */
async function foldIntoJob(fresh, digits) {
  const job = (await query(`select j.id from jobs j left join leads l on l.id = j.lead_id
      where j.site = $1 and j.status = 'booked' and not j.date_set
        and ((coalesce(coalesce(j.customer_email, l.email), '') <> '' and lower(coalesce(j.customer_email, l.email)) = lower(coalesce($2, '')))
          or (length($3) > 6 and regexp_replace(coalesce(j.customer_phone, l.phone, ''), '\\D', '', 'g') in ($3, '44' || substr($3, 2))))
      order by j.id desc limit 1`, [fresh.site, fresh.email || '', digits]))[0];
  if (!job) return 0;
  const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: 'Sent the website form again while waiting for a time.' };
  await query("update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1", [job.id, JSON.stringify([note])]);
  await query("update leads set closed_at = now(), closed_reason = 'Duplicate: already has a job card' where id = $1", [fresh.id]);
  return 1;
}
