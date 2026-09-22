/**
 * Writing an allocation back to a line, and teaching the importer from it.
 *
 * One place writes a line's category, split, shares and job, so the map of
 * shares and the four legacy share columns can never disagree: the columns
 * are filled from the map, for the damp keys, and are zero for everyone else.
 */
import { query } from '../db.js';
import { shares } from './allocate.js';

const LEGACY = ['scott', 'tom', 'ben', 'tax'];

export async function writeAllocation(id, a) {
  const legacy = LEGACY.map((k) => Number(a.shares[k]) || 0);
  await query(
    `update bank_transactions
        set category = $2, category_kind = $3, split = $4, split_kind = $5, shares = $6::jsonb,
            share_scott_pence = $7, share_tom_pence = $8, share_ben_pence = $9, share_tax_pence = $10,
            job_id = $11, match_kind = $12, updated_at = now()
      where id = $1`,
    [id, a.category, a.categoryKind, a.split, a.splitKind, JSON.stringify(a.shares), ...legacy, a.jobId, a.matchKind]
  );
}

/**
 * Remembers a choice for a description and applies it to every other line in
 * the same books with the same key that nobody has touched. A choice made by
 * hand on one line is never overwritten by a choice made on another.
 *
 * @returns {number[]} the ids of the lines that changed
 */
export async function teach(books, tx, category, split, targets) {
  await query(
    `insert into bank_rules (books, key, category, split) values ($1, $2, $3, $4)
     on conflict (books, key) do update set category = excluded.category, split = excluded.split, updated_at = now()`,
    [books.key, tx.rule_key, category, split]
  );
  const similar = await query(
    `select id, amount_pence, job_id, match_kind from bank_transactions
      where books = $1 and rule_key = $2 and id <> $3 and job_id is null
        and category_kind = 'auto' and split_kind = 'auto'`,
    [books.key, tx.rule_key, Number(tx.id)]
  );
  const changed = [];
  for (const s of similar) {
    const id = Number(s.id);
    await writeAllocation(id, {
      category, categoryKind: 'auto', split, splitKind: 'auto',
      shares: shares(Number(s.amount_pence), split, targets), jobId: null, matchKind: null
    });
    changed.push(id);
  }
  return changed;
}
