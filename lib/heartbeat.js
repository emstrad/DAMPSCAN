/**
 * When each scheduled run last finished (cron_beats), so Settings can say
 * whether the hourly run (GitHub's report-due workflow) and the daily runs are
 * really going: the morning texts, the bank feed and the money checks all
 * ride on the hourly one.
 */
import { query, queryOne } from './db.js';

export const beat = (name) => query(`insert into cron_beats (name, at) values ($1, now()) on conflict (name) do update set at = now()`, [name]);
export async function lastBeat(name) {
  const r = await queryOne('select at from cron_beats where name = $1', [name]);
  return r ? r.at : null;
}
