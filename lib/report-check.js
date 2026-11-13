/**
 * A surveyor's report waits for an owner (the owner's choice, 13 Nov 2026):
 * when Ben or Ronnie mark their report done (Report sent on the card, Today,
 * the board or ChatGPT), nothing goes to the customer. It is noted as
 * submitted, the owners get one to-do and an alert, and the report reaches
 * the customer only when a manager presses Report ready (which texts them
 * and unlocks it on their page once paid). Unticking takes it back.
 */
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { brandName, customer, jobPage } from './alert-words.js';

const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'The customer';
const district = (pc) => String(pc || '').trim().toUpperCase().split(/\s+/)[0];

/** Marks it submitted (on) or takes it back (off). Returns { ok, submitted }. */
export async function submitReport(scope, id, on) {
  const who = String(scope.name || 'A surveyor').trim().split(/\s+/)[0];
  const j = await queryOne(`update jobs set report_submitted_at = case when $2 then coalesce(report_submitted_at, now()) else null end,
      report_submitted_by = case when $2 then coalesce(report_submitted_by, $3) else null end
      where id = $1 and survey_sent_at is null returning id, site, customer_name, customer_postcode, report_path, report_submitted_at`, [id, on, who]);
  if (!j) return { ok: true, submitted: false };
  if (on) {
    const text = `${who} has finished ${first(j.customer_name)}'s report (${district(j.customer_postcode)}): check it and press Report ready to send it to them.${j.report_path ? '' : ' No file is uploaded yet.'}`;
    await query(`insert into todos (site, job_id, text, for_owners, set_by_name, source)
        select $1, $2, $3, true, $4, 'manual' where not exists (select 1 from todos where job_id = $2 and done_at is null and text like '% report (%: check it and press Report ready%')`,
      [j.site, j.id, text, who]);
    await notify({ business: j.site, kind: 'report_submitted', ref: Number(j.id), tags: 'page_facing_up', priority: 3, path: jobPage(j.site, j.id),
      title: `${brandName(j.site)}: ${who}`, message: `${who} finished ${customer(j.customer_name, j.customer_postcode)}'s report. Check it, then Report ready.` });
  }
  return { ok: true, submitted: on };
}
