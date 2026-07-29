/**
 * GET /api/health
 *
 * Uptime check and first-line diagnostic. Reports three separable things, so a
 * failure points at its own cause instead of needing a log dive:
 *
 *   db false                  the connection string is wrong or unreachable
 *   db true, schema not ready the database is fine but tables are missing
 *   both true                 the app can actually serve traffic
 *
 * The table names are already public in this repository, so naming the missing
 * ones here gives away nothing and saves a great deal of guessing.
 */
import { query } from '../lib/db.js';
import { json, requireMethod } from '../lib/http.js';

export const config = { runtime: 'nodejs' };

const EXPECTED_TABLES = ['events', 'leads', 'rate_hits', 'staff_users'];

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  let db = false;
  let present = [];
  let error = null;

  try {
    const rows = await query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = any($1::text[])`,
      [EXPECTED_TABLES]
    );
    db = true;
    present = rows.map((r) => r.table_name).sort();
  } catch (err) {
    // Surface the reason, not the connection string. Neon errors name the host,
    // never the password, and this is the fastest way to tell a bad credential
    // apart from a missing table.
    error = String(err.message || err).slice(0, 200);
  }

  const missing = EXPECTED_TABLES.filter((t) => !present.includes(t));
  const body = { ok: true, db, schema: { ready: db && missing.length === 0, missing } };
  if (error) body.error = error;

  json(res, 200, body);
}
