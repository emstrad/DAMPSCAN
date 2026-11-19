/**
 * Keeps What's next in customer_state (db/schema.sql), so ChatGPT and Claude
 * read exactly what the page shows. Only rows for the sites just worked out
 * are replaced: a manager of one brand never wipes the other's.
 */
import { query } from './db.js';

export async function persistState(rows, sites) {
  if (!sites.length) return;
  const keys = rows.filter((r) => sites.includes(r.site)).map((r) => r.key);
  await query(`delete from customer_state where site = any($1::text[]) and not (key = any($2::text[]))`, [sites, keys]);
  for (const r of rows) {
    if (!sites.includes(r.site)) continue;
    await query(`insert into customer_state (key, kind, job_id, lead_id, site, name, postcode, stage, lane, next_step, why, since, owed_pence, old_money, last_contact, todos, computed_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, now())
        on conflict (key) do update set stage = excluded.stage, lane = excluded.lane, next_step = excluded.next_step, why = excluded.why, since = excluded.since,
          owed_pence = excluded.owed_pence, old_money = excluded.old_money, last_contact = excluded.last_contact, todos = excluded.todos, name = excluded.name,
          postcode = excluded.postcode, lead_id = excluded.lead_id, computed_at = now()`,
    [r.key, r.kind, r.jobId, r.leadId, r.site, r.name, r.postcode, r.stage, r.lane, r.next, r.why, r.since, r.owedPence || 0, Boolean(r.oldMoney),
      r.lastContact ? JSON.stringify(r.lastContact) : null, (r.todos || []).length]);
  }
}
