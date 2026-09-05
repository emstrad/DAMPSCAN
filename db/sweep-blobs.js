/**
 * Sweep uploads no lead points at, by hand.
 *
 *   npm run sweep-blobs -- --dry-run     list what would go, delete nothing
 *   npm run sweep-blobs                  delete them
 *   npm run sweep-blobs -- --force       proceed even if the database reports
 *                                        no attachments at all (read lib/sweep.js
 *                                        before reaching for this)
 *
 * Needs DATABASE_URL and BLOB_READ_WRITE_TOKEN in .env, the same as the other
 * scripts here. `vercel env pull` fetches both.
 */
import 'dotenv/config';
import { sweepOrphans } from '../lib/sweep.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');

const result = await sweepOrphans({ dryRun, force });

if (!result.ok) {
  console.error(`Sweep did not run: ${result.reason}`);
  if (result.reason === 'nothing_referenced') {
    console.error(`The store has ${result.orphans} blob(s) older than a day and the database names none.`);
    console.error('Check DATABASE_URL points at production. If it does and that is genuinely the state, re-run with --force.');
  }
  process.exit(1);
}

console.log(`Scanned ${result.scanned} blob(s) under leads/, ${result.referenced} referenced by a lead.`);
console.log(dryRun
  ? `${result.orphans} orphan(s) would be removed. Nothing was deleted (dry run).`
  : `${result.removed} orphan(s) removed.`);
