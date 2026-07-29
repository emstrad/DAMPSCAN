/**
 * Neon client.
 *
 * Uses the serverless HTTP driver against the pooled connection string, so each
 * function invocation makes a stateless request rather than holding a socket
 * open. The client is created lazily and cached on the module so warm
 * invocations reuse it.
 */
import { neon } from '@neondatabase/serverless';

let client = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}

/**
 * Runs a parameterised statement and returns the rows.
 * Always pass values as parameters, never interpolate them into the text.
 */
export async function query(text, params = []) {
  return await sql().query(text, params);
}

/** Single row, or null. */
export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows.length ? rows[0] : null;
}

/** Used by /api/health. Returns true when the database answers. */
export async function ping() {
  try {
    const row = await queryOne('select 1 as ok');
    return row?.ok === 1;
  } catch {
    return false;
  }
}
