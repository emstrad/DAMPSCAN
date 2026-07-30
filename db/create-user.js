#!/usr/bin/env node
/**
 * Creates a staff account.
 *
 * DORMANT: /api/auth/login now takes a single STAFF_ACCESS_CODE and does not read
 * staff_users at all. This script is kept working so per-user accounts can be
 * restored later without rebuilding them.
 *
 *   npm run create-user -- --email=you@example.com --name="Your Name" --role=admin
 *
 * The password is prompted for, hashed with argon2id and only then written. No
 * default credential exists anywhere in this repo, and nothing is ever seeded.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { hash, Algorithm } from '@node-rs/argon2';
import { queryOne } from '../lib/db.js';
import { ask, askHidden, parseArgs, checkPassword } from './prompt.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['staff', 'admin'];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || (await ask('Email: '))).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    console.error(`"${email}" is not a valid email address.`);
    process.exit(1);
  }

  const existing = await queryOne('select id, disabled from staff_users where lower(email) = $1', [email]);
  if (existing) {
    console.error(`${email} already exists (id ${existing.id}).`);
    console.error('To change its password or enable/disable it, use: npm run set-user -- --help');
    process.exit(1);
  }

  const name = (args.name || (await ask('Name (optional): '))).trim() || null;

  const role = (args.role || 'staff').trim().toLowerCase();
  if (!ROLES.includes(role)) {
    console.error(`Role must be one of: ${ROLES.join(', ')}`);
    process.exit(1);
  }

  const password = await askHidden('Password (12 characters or more, not shown): ');
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
  const row = await queryOne(
    `insert into staff_users (email, password_hash, name, role)
     values ($1, $2, $3, $4) returning id, email, role`,
    [email, passwordHash, name, role]
  );

  console.log(`Created ${row.email} (id ${row.id}, role ${row.role}).`);
  console.log('Sign in at https://dampscan.co.uk/staff');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
