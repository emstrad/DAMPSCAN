#!/usr/bin/env node
/**
 * Applies db/schema.sql against DATABASE_URL.
 *
 *   npm run migrate
 *
 * schema.sql is idempotent, so re-running is safe and is the normal way to roll
 * a schema change forward.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';
import { query } from '../lib/db.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Splits a SQL script into individual statements. The Neon HTTP driver runs one
 * statement per round trip, so the file has to be broken up first. Quotes,
 * dollar-quoted blocks and comments are respected so a semicolon inside any of
 * them is not treated as a boundary.
 */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) { j += 2; continue; }
        if (sql[j] === quote) break;
        j += 1;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i += 1;
      continue;
    }
    buf += sql[i];
    i += 1;
  }

  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const schema = await readFile(join(here, 'schema.sql'), 'utf8');
  const statements = splitStatements(schema);
  console.log(`Applying ${statements.length} statements from db/schema.sql`);

  for (const [n, statement] of statements.entries()) {
    const label = statement.replace(/\s+/g, ' ').slice(0, 72);
    try {
      await query(statement);
      console.log(`  ${String(n + 1).padStart(2, ' ')}. ok   ${label}`);
    } catch (err) {
      console.error(`  ${String(n + 1).padStart(2, ' ')}. FAIL ${label}`);
      console.error(`      ${err.message}`);
      process.exit(1);
    }
  }

  const [{ tables }] = await query(
    `select count(*)::int as tables from information_schema.tables
      where table_schema = 'public' and table_name in ('leads','events','staff_users','rate_hits')`
  );
  console.log(`Done. ${tables} of 4 expected tables present.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
