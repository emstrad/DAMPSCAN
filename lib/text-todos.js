/**
 * The to-dos a text makes for a person (lib/texts.js): a customer with no
 * mobile, and a text Twilio refused or that never arrived. One open one per
 * customer and kind, so a Twilio problem never piles them up, and each closes
 * itself once a later text gets through (lib/todo-sweep.js).
 */
import { query } from './db.js';

const SAME = `((job_id is not null and job_id = $2::bigint) or (lead_id is not null and lead_id = $3::bigint))`;

/** One to-do for this customer unless one like it (`like`) is still open, or ever was (`ever`: no mobile is once per survey). */
export async function textTodo(row, text, like, { ever = false } = {}) {
  await query(`insert into todos (site, job_id, lead_id, text, for_owners, set_by_name, source) select $1, $2::bigint, $3::bigint, $4, true, 'Texts', 'manual'
      where not exists (select 1 from todos where ${ever ? '' : 'done_at is null and '}set_by_name = 'Texts' and text like $5 and ${SAME})`,
    [row.site, row.job_id, row.lead_id, text, like]);
}
