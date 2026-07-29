#!/usr/bin/env node
/**
 * Changes an existing staff account.
 *
 *   npm run set-user -- --email=scott@damp-survey.com --disable
 *   npm run set-user -- --email=scott@damp-survey.com --enable
 *   npm run set-user -- --email=scott@damp-survey.com --password
 *   npm run set-user -- --email=scott@damp-survey.com --role=admin
 *   npm run set-user -- --list
 *
 * Disabling is preferred over deleting: it revokes access immediately while
 * keeping the account's history intact. Sessions already issued stay valid until
 * they expire, so rotate SESSION_SECRET as well if you need to cut someone off
 * that instant.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { hash, Algorithm } from '@node-rs/argon2';
import { query, queryOne } from '../lib/db.js';
import { askHidden, parseArgs, checkPassword } from './prompt.js';

const USAGE = `Usage:
  npm run set-user -- --list
  npm run set-user -- --email=<address> [--disable|--enable] [--password] [--role=staff|admin] [--name="..."]`;

async function list() {
  const rows = await query(
    `select id, email, name, role, disabled, last_login_at, created_at
       from staff_users order by created_at asc`
  );
  if (!rows.length) {
    console.log('No staff accounts yet. Create one with: npm run create-user -- --email=you@example.com');
    return;
  }
  for (const row of rows) {
    const state = row.disabled ? 'DISABLED' : 'active';
    const seen = row.last_login_at ? new Date(row.last_login_at).toISOString() : 'never signed in';
    console.log(`${String(row.id).padStart(3, ' ')}  ${row.email.padEnd(34, ' ')} ${row.role.padEnd(6, ' ')} ${state.padEnd(9, ' ')} ${seen}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.list) {
    await list();
    return;
  }

  const email = String(args.email || '').trim().toLowerCase();
  if (!email) {
    console.error(USAGE);
    process.exit(1);
  }

  const user = await queryOne('select id, email, role, disabled from staff_users where lower(email) = $1', [email]);
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const changes = [];

  if (args.disable && args.enable) {
    console.error('Pass either --disable or --enable, not both.');
    process.exit(1);
  }
  if (args.disable) {
    await query('update staff_users set disabled = true where id = $1', [user.id]);
    changes.push('disabled');
  }
  if (args.enable) {
    await query('update staff_users set disabled = false where id = $1', [user.id]);
    changes.push('enabled');
  }

  if (args.role) {
    const role = String(args.role).trim().toLowerCase();
    if (!['staff', 'admin'].includes(role)) {
      console.error('Role must be staff or admin.');
      process.exit(1);
    }
    await query('update staff_users set role = $1 where id = $2', [role, user.id]);
    changes.push(`role set to ${role}`);
  }

  if (args.name !== undefined) {
    const name = String(args.name).trim() || null;
    await query('update staff_users set name = $1 where id = $2', [name, user.id]);
    changes.push('name updated');
  }

  if (args.password) {
    const password = await askHidden('New password (12 characters or more, not shown): ');
    const problem = checkPassword(password);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    const again = await askHidden('Confirm password: ');
    if (password !== again) {
      console.error('Passwords did not match.');
      process.exit(1);
    }
    const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id });
    await query('update staff_users set password_hash = $1 where id = $2', [passwordHash, user.id]);
    changes.push('password changed');
  }

  if (!changes.length) {
    console.error('Nothing to do.');
    console.error(USAGE);
    process.exit(1);
  }
  console.log(`${user.email}: ${changes.join(', ')}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
