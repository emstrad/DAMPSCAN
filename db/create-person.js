#!/usr/bin/env node
/**
 * Creates a person who can sign in to the staff area with their own passcode.
 *
 *   npm run create-person -- --name="Steve" --grants=roofing
 *   npm run create-person -- --name="Ben" --grants=dampscan,ati-london,roofing
 *   npm run create-person -- --name="Scott" --admin --grants=dampscan,ati-london,roofing,ac
 *
 * The passcode is prompted for and never passed on the command line, where it
 * would sit in shell history. It is hashed with argon2id and only the hash is
 * stored.
 *
 * The passcode is the identity, so it must be unique across people: two people
 * with the same six digits would be one login. That is checked here against
 * every existing hash, which is the only place it can be, since the hashes
 * cannot be compared to each other.
 */
import 'dotenv/config';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { query, queryOne } from '../lib/db.js';
import { ask, askHidden, parseArgs } from './prompt.js';

const MIN_LENGTH = 6;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const name = (args.name || (await ask('Name: '))).trim();
  if (!name) {
    console.error('A name is required.');
    process.exit(1);
  }

  const grants = String(args.grants || (await ask('Businesses, comma separated (dampscan, ati-london, roofing, ac): ')))
    .split(',').map((g) => g.trim()).filter(Boolean);
  const known = (await query('select slug from businesses where active')).map((r) => r.slug);
  const unknown = grants.filter((g) => !known.includes(g));
  if (unknown.length) {
    console.error(`Unknown business: ${unknown.join(', ')}. Known: ${known.join(', ')}`);
    process.exit(1);
  }
  const isAdmin = Boolean(args.admin);
  if (!grants.length && !isAdmin) {
    console.error('A person with no businesses and no admin flag could sign in and see nothing. Refusing.');
    process.exit(1);
  }

  const passcode = await askHidden(`Passcode (${MIN_LENGTH} characters or more, not shown): `);
  if (passcode.length < MIN_LENGTH) {
    console.error(`Passcode must be ${MIN_LENGTH} characters or more.`);
    process.exit(1);
  }
  const again = await askHidden('Confirm passcode: ');
  if (passcode !== again) {
    console.error('Passcodes did not match.');
    process.exit(1);
  }

  /* Uniqueness. Every existing hash is verified against the new passcode,
     because that is the only way to know whether somebody already has it. */
  const existing = await query('select id, name, passcode_hash from people');
  for (const p of existing) {
    if (await verify(p.passcode_hash, passcode)) {
      console.error(`That passcode is already in use by ${p.name} (id ${p.id}). Choose another.`);
      process.exit(1);
    }
  }

  const passcodeHash = await hash(passcode, { algorithm: Algorithm.Argon2id });
  const person = await queryOne(
    'insert into people (name, passcode_hash, is_admin) values ($1, $2, $3) returning id',
    [name, passcodeHash, isAdmin]
  );
  for (const slug of grants) {
    await query(
      `insert into grants (person_id, business_slug, level) values ($1, $2, $3)
       on conflict (person_id, business_slug) do update set level = excluded.level`,
      [person.id, slug, isAdmin ? 'manage' : 'work']
    );
  }

  console.log(`Created ${name} (id ${person.id})${isAdmin ? ', admin' : ''}: ${grants.join(', ') || 'no businesses'}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
