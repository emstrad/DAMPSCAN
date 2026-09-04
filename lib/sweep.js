/**
 * Sweeping orphaned uploads.
 *
 * A file is uploaded before the booking is submitted, so somebody who attaches
 * photos and then closes the tab leaves blobs in the store that no lead points
 * at. Harmless, and cheap at this site's volume, but a store that only ever
 * grows is a bill that only ever grows, and a private blob nobody can reach
 * is worth nothing to anyone.
 *
 * The rule is deliberately narrow. A blob is removed only if all three hold:
 *
 *   it is under leads/, the only prefix this app writes;
 *   no row in leads names it in files;
 *   it is older than a day, so an upload in progress right now, whose booking
 *   has not been submitted yet, is never touched.
 *
 * And one refusal on top: if the database reports no attachments at all but
 * the store has blobs, that is more likely a wrong DATABASE_URL than a store
 * full of abandonments, and deleting on that basis would be deleting every
 * customer's file. It takes `force` to proceed from there.
 */
import { list, del } from '@vercel/blob';
import { query } from './db.js';
import { blobConfigured } from './blob.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'leads/';
const DELETE_BATCH = 100;

/**
 * @param {{olderThanMs?: number, dryRun?: boolean, force?: boolean}} options
 * @returns {Promise<{ok: boolean, reason?: string, scanned: number, referenced: number, orphans: number, removed: number}>}
 */
export async function sweepOrphans({ olderThanMs = DAY_MS, dryRun = false, force = false } = {}) {
  const out = { ok: false, scanned: 0, referenced: 0, orphans: 0, removed: 0 };
  if (!blobConfigured()) return { ...out, reason: 'not_configured' };

  /* The database first, and abort on any failure. A blob list compared against
     an empty set because the query threw is the one outcome this must never
     produce. */
  let keep;
  try {
    const rows = await query('select distinct unnest(files) as path from leads');
    keep = new Set(rows.map((r) => r.path));
  } catch (err) {
    return { ...out, reason: `db_failed: ${err.message}` };
  }
  out.referenced = keep.size;

  const cutoff = Date.now() - olderThanMs;
  const orphans = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      out.scanned++;
      if (keep.has(blob.pathname)) continue;
      if (new Date(blob.uploadedAt).getTime() >= cutoff) continue;
      orphans.push(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  out.orphans = orphans.length;

  if (!keep.size && orphans.length && !force) {
    return { ...out, reason: 'nothing_referenced' };
  }

  if (!dryRun) {
    for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
      await del(orphans.slice(i, i + DELETE_BATCH));
      out.removed += Math.min(DELETE_BATCH, orphans.length - i);
    }
  }

  return { ...out, ok: true };
}
