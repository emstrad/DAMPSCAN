/**
 * The same person sending the form twice (a second go, or a different page)
 * is one customer, not two cards. When a finished enquiry arrives, any open
 * earlier one for the same person in the same business (lib/same-person.js:
 * same email, same phone, or the same first name at the same postcode), in
 * the last 60 days, is folded into it, filling in any detail the new one
 * lacks: its call log, the times they wanted and
 * any pencilled time move to the new one, which says so, and the old one
 * closes as a duplicate (it stays on the Leads page, pointing at the new).
 */
import { query } from './db.js';
import { sameParams, sameSql, LEAD, JOB, FILL } from './same-person.js';

/* Only the damp sites work customers on Scheduling; Verge and CoolRight keep their own pipelines. */
const DAMP = ['dampscan', 'ati-london'];

export async function mergeDuplicates(id) {
  const fresh = (await query('select id, site, email, phone, first_name, postcode, sched_log, sched_wanted, pencil_date from leads where id = $1', [id]))[0];
  if (!fresh || !DAMP.includes(fresh.site)) return 0;
  const old = await query(`select id, created_at, sched_log, sched_wanted, sched_stage, pencil_date, pencil_time, pencil_surveyor, pencil_until, pencil_by, pencil_set_at, pencil_forced, pencil_chased_at, next_contact_on, next_contact_why,
             estate_agent_id, referred_by, survey_choice, files, phone, email, postcode, address_line1
      from leads l where l.id <> $1 and l.site = $2 and l.stage = 'complete' and l.closed_at is null and l.created_at > now() - interval '60 days'
        and not exists (select 1 from jobs j where j.lead_id = l.id)
        and ${sameSql(LEAD('l'), 3)}
      order by l.created_at`, [id, fresh.site, ...sameParams({ email: fresh.email, phone: fresh.phone, name: fresh.first_name, postcode: fresh.postcode })]);
  for (const o of old) {
    const day = new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: `Sent the form again; their earlier enquiry of ${day} is merged in here.` };
    await query(`update leads set sched_log = coalesce($2::jsonb, '[]'::jsonb) || coalesce(sched_log, '[]'::jsonb) || $3::jsonb,
        sched_wanted = coalesce(sched_wanted, $4), sched_stage = coalesce(sched_stage, $5),
        estate_agent_id = coalesce(estate_agent_id, $6), survey_choice = coalesce(survey_choice, $7::jsonb), referred_by = coalesce(referred_by, $9),
        files = case when cardinality(files) > 0 then files else coalesce($8::text[], files) end where id = $1`,
      [id, JSON.stringify(o.sched_log || []), JSON.stringify([note]), o.sched_wanted, o.sched_stage,
        o.estate_agent_id, o.survey_choice ? JSON.stringify(o.survey_choice) : null, o.files || null, o.referred_by || null]);
    await query(`update leads set ${FILL} where id = $1`, [id, o.phone || null, o.email || null, o.postcode || null, o.address_line1 || null]);
    /* Their hold (with whether it was chased) and when to get back to them come too; the new card is
       read again each time round, so a second old enquiry never overwrites the first one's hold. */
    const now = (await query('select pencil_date from leads where id = $1', [id]))[0] || {};
    if (o.pencil_date && !now.pencil_date) {
      await query(`update leads set pencil_date = $2, pencil_time = $3, pencil_surveyor = $4, pencil_until = $5, pencil_by = $6, pencil_set_at = $7, pencil_forced = $8, pencil_chased_at = $9 where id = $1`,
        [id, o.pencil_date, o.pencil_time, o.pencil_surveyor, o.pencil_until, o.pencil_by, o.pencil_set_at, o.pencil_forced, o.pencil_chased_at]);
    }
    if (o.next_contact_on) {
      await query(`update leads set next_contact_on = least(coalesce(next_contact_on, $2::date), $2::date), next_contact_why = coalesce(next_contact_why, $3) where id = $1`,
        [id, o.next_contact_on, o.next_contact_why]);
    }
    await query('update todos set lead_id = $2 where lead_id = $1', [o.id, id]);
    await query(`update leads set closed_at = now(), closed_reason = 'Duplicate: sent the form again', merged_into = $2,
        pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null where id = $1`, [o.id, id]);
  }
  if (!old.length) return foldIntoJob(fresh);
  return old.length;
}

/* The same person sending the form again while their job card has no date yet:
   noted on that card, and this enquiry closed, so there is never a second card. */
async function foldIntoJob(fresh) {
  const job = (await query(`select j.id from jobs j left join leads l on l.id = j.lead_id
      where j.site = $1 and j.status = 'booked' and not j.date_set
        and ${sameSql(JOB('j', 'l'), 2)}
      order by j.id desc limit 1`, [fresh.site, ...sameParams({ email: fresh.email, phone: fresh.phone, name: fresh.first_name, postcode: fresh.postcode })]))[0];
  if (!job) return 0;
  const note = { at: new Date().toISOString(), by: 'Website', how: 'note', note: 'Sent the website form again while waiting for a time.' };
  await query("update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1", [job.id, JSON.stringify([note])]);
  /* The agent and photos from the repeat form come with it (the owners' rule: nothing they sent is lost). */
  await query(`update jobs j set estate_agent_id = coalesce(j.estate_agent_id, l.estate_agent_id),
      customer_files = case when cardinality(coalesce(l.files, '{}')) > 0 then coalesce(j.customer_files, '{}') || l.files else j.customer_files end
      from leads l where j.id = $1 and l.id = $2`, [job.id, fresh.id]);
  await query("update leads set closed_at = now(), closed_reason = 'Duplicate: already has a job card' where id = $1", [fresh.id]);
  return 1;
}

/**
 * Closed as a duplicate by hand on Scheduling: its to-dos (and a hold the
 * other card lacks) move to the same person's card that stays open, so
 * nothing they asked for sits on a card nobody sees.
 */
export async function moveToSame(id) {
  const dup = (await query(`select id, site, email, phone, first_name, postcode, pencil_date, pencil_time, pencil_surveyor, pencil_until, pencil_by, pencil_set_at, pencil_forced, pencil_chased_at
      from leads where id = $1`, [id]))[0];
  if (!dup) return null;
  const p = sameParams({ email: dup.email, phone: dup.phone, name: dup.first_name, postcode: dup.postcode });
  const lead = (await query(`select l.id, l.pencil_date from leads l where l.id <> $1 and l.site = $2 and l.closed_at is null and ${sameSql(LEAD('l'), 3)} order by l.created_at desc limit 1`, [id, dup.site, ...p]))[0];
  const job = lead ? null : (await query(`select j.id from jobs j left join leads l on l.id = j.lead_id where j.site = $1 and j.status = 'booked' and ${sameSql(JOB('j', 'l'), 2)} order by j.id desc limit 1`, [dup.site, ...p]))[0];
  if (lead) {
    await query('update todos set lead_id = $2 where lead_id = $1 and done_at is null', [id, lead.id]);
    if (dup.pencil_date && !lead.pencil_date) {
      await query(`update leads set pencil_date = $2, pencil_time = $3, pencil_surveyor = $4, pencil_until = $5, pencil_by = $6, pencil_set_at = $7, pencil_forced = $8, pencil_chased_at = $9 where id = $1`,
        [lead.id, dup.pencil_date, dup.pencil_time, dup.pencil_surveyor, dup.pencil_until, dup.pencil_by, dup.pencil_set_at, dup.pencil_forced, dup.pencil_chased_at]);
    }
  } else if (job) await query('update todos set job_id = $2, lead_id = null where lead_id = $1 and done_at is null', [id, job.id]);
  /* The closed one never holds a time. */
  await query('update leads set pencil_date = null, pencil_time = null, pencil_surveyor = null, pencil_until = null where id = $1', [id]);
  return lead ? { lead: Number(lead.id) } : job ? { job: Number(job.id) } : null;
}
