/**
 * Tests the real migration path.
 *
 * `npm run migrate` splits schema.sql into individual statements and sends them
 * one at a time, because the Neon HTTP driver runs one statement per round trip.
 * These tests exercise that exact split-and-apply sequence against Postgres, so
 * a schema change that only works as one big script cannot reach production.
 *
 * Everything runs inside a scratch schema, so it never touches the tables the
 * other tests use.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { splitStatements } from '../db/migrate.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://dampscan@127.0.0.1:55432/dampscan';

const SCRATCH = 'migrate_check';

let client;
let statements;

before(async () => {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  statements = splitStatements(schema);

  client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query(`drop schema if exists ${SCRATCH} cascade`);
  await client.query(`create schema ${SCRATCH}`);
  await client.query(`set search_path to ${SCRATCH}`);
});

after(async () => {
  if (!client) return;
  await client.query(`drop schema if exists ${SCRATCH} cascade`);
  await client.end();
});

test('schema.sql splits into individual, non-empty statements', () => {
  assert.ok(statements.length >= 13, `expected at least 13 statements, got ${statements.length}`);
  statements.forEach((statement, i) => {
    assert.ok(statement.trim().length > 0, `statement ${i} is empty`);
    assert.ok(!statement.trim().endsWith(';'), `statement ${i} still carries its terminator`);
    // A split that broke mid-statement would leave unbalanced parentheses.
    const open = (statement.match(/\(/g) || []).length;
    const close = (statement.match(/\)/g) || []).length;
    assert.equal(open, close, `statement ${i} has unbalanced parentheses, the split is wrong`);
  });
});

test('every statement applies individually, as the Neon driver sends them', async () => {
  for (const [i, statement] of statements.entries()) {
    try {
      await client.query(statement);
    } catch (err) {
      assert.fail(`statement ${i + 1} failed: ${err.message}\n${statement.slice(0, 200)}`);
    }
  }

  const { rows } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = $1 order by table_name`,
    [SCRATCH]
  );
  assert.deepEqual(rows.map((r) => r.table_name), ['events', 'job_rates', 'job_settings', 'jobs', 'leads', 'rate_hits', 'staff_users']);
});

test('re-running every statement is idempotent', async () => {
  for (const [i, statement] of statements.entries()) {
    try {
      await client.query(statement);
    } catch (err) {
      assert.fail(`statement ${i + 1} is not idempotent: ${err.message}`);
    }
  }
});

test('the indexes the dashboard queries rely on all exist', async () => {
  const { rows } = await client.query(
    `select indexname from pg_indexes where schemaname = $1`, [SCRATCH]
  );
  const names = rows.map((r) => r.indexname);
  [
    'leads_session_stage_idx', 'leads_created_at_idx', 'leads_email_idx',
    'events_created_at_idx', 'events_type_idx', 'events_session_idx', 'events_channel_idx',
    'rate_hits_lookup_idx', 'rate_hits_created_at_idx'
  ].forEach((idx) => assert.ok(names.includes(idx), `missing index ${idx}`));
});

test('the unique index really does stop a duplicate (session_id, stage)', async () => {
  const sid = '99999999-9999-4999-8999-999999999999';
  const insert = `insert into leads (stage, first_name, email, postcode, session_id)
                  values ('partial','A','a@b.co','SE1 2AB', $1)`;
  await client.query(insert, [sid]);
  await assert.rejects(
    () => client.query(insert, [sid]),
    /duplicate key value violates unique constraint/,
    'a second partial for one session must be rejected, otherwise leads double-count'
  );
});

test('check constraints reject values the app would never send', async () => {
  await assert.rejects(
    () => client.query(
      `insert into leads (stage, first_name, email, postcode, session_id)
       values ('halfway','A','a@b.co','SE1 2AB','88888888-8888-4888-8888-888888888888')`
    ),
    /violates check constraint/,
    'stage is limited to partial and complete'
  );

  await assert.rejects(
    () => client.query(
      `insert into events (session_id, type) values ('88888888-8888-4888-8888-888888888888','exfiltrate')`
    ),
    /violates check constraint/,
    'event type is a closed set at the database level, not just in the handler'
  );

  await assert.rejects(
    () => client.query(
      `insert into staff_users (email, password_hash, role) values ('a@b.co','x','superuser')`
    ),
    /violates check constraint/,
    'role is limited to staff and admin'
  );
});
