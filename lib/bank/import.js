/**
 * Turning an uploaded statement into rows in one set of books.
 *
 * Parse, drop what those books already hold, then for each new line: a rule
 * those books learned if one matches its description, otherwise a job of the
 * businesses in those books if one clearly matches the payment, otherwise the
 * built-in guess. Everything that took a decision records how it was decided,
 * so a later rule can overwrite a guess and never something a person chose.
 *
 * Lines are inserted in batches. The Neon HTTP driver is one round trip per
 * statement and a year of Revolut is several hundred lines, so one insert per
 * line would run out the function's time budget on a large upload.
 */
import { query, queryOne } from '../db.js';
import { revolutRows, fingerprint } from './csv.js';
import { autoTag, ruleKey } from './categories.js';
import { shares } from './allocate.js';
import { autoMatch } from './match.js';
import { candidateJobs, syncPayments } from './ledger.js';
import { translateSplit } from './books.js';

const BATCH = 40;

const COLUMNS = [
  'statement_id', 'fingerprint', 'external_id', 'posted_on', 'posted_time', 'type',
  'description', 'reference', 'counterparty', 'mcc', 'currency', 'amount_pence', 'fee_pence',
  'balance_pence', 'category', 'category_kind', 'split', 'split_kind',
  'share_scott_pence', 'share_tom_pence', 'share_ben_pence', 'share_tax_pence',
  'job_id', 'match_kind', 'rule_key', 'books', 'shares'
];

/* The first names the importer may recognise a partner by: damp's three in
   damp's books, the people who hold the business in the others. */
function partnerNames(books) {
  if (books.model === 'damp') return undefined;
  return books.targets.filter((t) => t.personId).map((t) => t.name.toLowerCase().split(/\s+/)[0]);
}

/** Decide category, split and job for one new line. */
function decide(tx, rules, jobs, books) {
  const key = ruleKey(tx);
  const rule = rules.get(key);
  if (rule) return { key, category: rule.category, split: rule.split, jobId: null, matchKind: null };

  if (tx.amountPence > 0) {
    const jobId = autoMatch(tx, jobs);
    if (jobId) {
      // Keep the running total honest for the next line: a deposit matched
      // here means the balance, not the full price, is what the same job now
      // expects.
      const job = jobs.find((j) => j.id === jobId);
      if (job) job.receivedPence += tx.amountPence;
      return { key, category: 'income', split: [], jobId, matchKind: 'auto' };
    }
  }

  const guess = autoTag(tx, partnerNames(books));
  return { key, category: guess.category, split: translateSplit(guess.split, books), jobId: null, matchKind: null };
}

async function insertBatch(rows) {
  const params = [];
  const tuples = rows.map((values) => {
    const marks = values.map((v) => { params.push(v); return `$${params.length}`; });
    return `(${marks.join(', ')})`;
  });
  await query(
    `insert into bank_transactions (${COLUMNS.join(', ')}) values ${tuples.join(', ')}
     on conflict (books, fingerprint) do nothing`,
    params
  );
}

/**
 * @returns {{ok: true, statementId, added, duplicates, skipped, matched, seen}}
 *          or {ok: false, error}
 */
export async function importStatement(text, filename, books) {
  const parsed = revolutRows(text);
  if (parsed.error) return { ok: false, error: parsed.error };

  const stamped = parsed.rows.map((tx) => ({ ...tx, fingerprint: fingerprint(tx) }));
  const seen = new Set();
  const unique = stamped.filter((tx) => !seen.has(tx.fingerprint) && seen.add(tx.fingerprint));

  const known = new Set((await query(
    'select fingerprint from bank_transactions where books = $2 and fingerprint = any($1::text[])',
    [unique.map((tx) => tx.fingerprint), books.key]
  )).map((r) => r.fingerprint));
  const fresh = unique.filter((tx) => !known.has(tx.fingerprint));

  const dates = unique.map((tx) => tx.postedOn).sort();
  const statement = await queryOne(
    `insert into bank_statements (filename, account, first_on, last_on, rows_seen, rows_added, books)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [filename || null, unique.find((tx) => tx.account)?.account || null,
      dates[0] || null, dates[dates.length - 1] || null, parsed.rows.length, fresh.length, books.key]
  );

  const rules = new Map((await query('select key, category, split from bank_rules where books = $1', [books.key]))
    .map((r) => [r.key, { category: r.category, split: r.split || [] }]));
  const jobs = fresh.some((tx) => tx.amountPence > 0) ? await candidateJobs(null, books) : [];
  const targets = books.targets.map((t) => t.key);

  const matchedJobs = [];
  let matched = 0;
  const values = fresh.map((tx) => {
    const d = decide(tx, rules, jobs, books);
    const share = shares(tx.amountPence, d.split, targets);
    if (d.jobId) { matched += 1; matchedJobs.push(d.jobId); }
    return [
      statement.id, tx.fingerprint, tx.externalId, tx.postedOn, tx.postedTime, tx.type,
      tx.description, tx.reference, tx.counterparty, tx.mcc, tx.currency, tx.amountPence, tx.feePence,
      tx.balancePence, d.category, 'auto', d.split, 'auto',
      share.scott || 0, share.tom || 0, share.ben || 0, share.tax || 0,
      d.jobId, d.matchKind, d.key, books.key, JSON.stringify(share)
    ];
  });

  for (let i = 0; i < values.length; i += BATCH) await insertBatch(values.slice(i, i + BATCH));
  await syncPayments(books, matchedJobs, 'forward');

  return {
    ok: true,
    statementId: Number(statement.id),
    seen: parsed.rows.length,
    added: fresh.length,
    duplicates: unique.length - fresh.length,
    skipped: parsed.skipped,
    matched
  };
}
