/**
 * /api/admin/bank
 *
 *   GET     ?view=attention|in|out|all&from=YYYY-MM-DD
 *           the lines, the jobs they could be matched to, the reconciliation
 *   POST    ?op=import&name=file.csv   the statement itself as the body
 *   POST    {id, category?, split?, jobId?, applyToSimilar?}   change one line
 *   DELETE  {statementId}   take an upload out again
 *
 * A line is either matched to a job or split between people, never both: a
 * matched payment's owners are whatever the job's own ledger says. Choosing a
 * category or a split by hand also teaches the importer, and by default the
 * same choice is applied to every other line with the same description that
 * nobody has touched, which is what makes the second month's upload cheaper
 * than the first.
 */
import { query, queryOne } from '../../db.js';
import { json, requireMethod, readJson, readText, str } from '../../http.js';
import { requireScope, requireAdmin } from '../../access.js';
import { CATEGORIES, CATEGORY_KEYS } from '../../bank/categories.js';
import { normaliseSplit, shares } from '../../bank/allocate.js';
import { suggest } from '../../bank/match.js';
import { TX_SELECT, toRow, candidateJobs, syncJobPayments, totals } from '../../bank/ledger.js';
import { importStatement } from '../../bank/import.js';

export const config = { runtime: 'nodejs' };

/* Just under what Vercel will carry into a function. A year of Revolut is a
   few hundred kilobytes. */
const MAX_CSV_BYTES = 4 * 1024 * 1024;
const MAX_LIMIT = 500;

const VIEWS = {
  attention: `t.job_id is null and cardinality(t.split) = 0 and t.category <> 'transfer'`,
  in: 't.amount_pence > 0',
  out: 't.amount_pence < 0',
  all: 'true'
};

const ORDER = 't.posted_on desc, t.posted_time desc nulls last, t.id desc';

function fromParam(url) {
  const v = url.searchParams.get('from');
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const SHARE_SET = `share_scott_pence = $N, share_tom_pence = $N, share_ben_pence = $N, share_tax_pence = $N`;

/** "$N" placeholders filled in left to right from `start`. */
function numbered(fragment, start) {
  let n = start - 1;
  return fragment.replace(/\$N/g, () => `$${++n}`);
}

async function statements() {
  const rows = await query(
    `select s.id, s.imported_at, s.filename, s.account, s.first_on::text as first_on, s.last_on::text as last_on,
            s.rows_seen, s.rows_added,
            (select count(*) from bank_transactions t where t.statement_id = s.id) as lines
       from bank_statements s order by s.imported_at desc, s.id desc limit 50`
  );
  return rows.map((r) => ({
    id: Number(r.id), importedAt: r.imported_at, filename: r.filename, account: r.account,
    firstOn: r.first_on, lastOn: r.last_on, rowsSeen: Number(r.rows_seen), rowsAdded: Number(r.rows_added),
    lines: Number(r.lines)
  }));
}

async function list(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const param = url.searchParams.get('view') || 'attention';
  const view = VIEWS[param] ? param : 'attention';
  const from = fromParam(url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || MAX_LIMIT));

  const rows = await query(
    `${TX_SELECT} where ${VIEWS[view]} and t.posted_on >= coalesce($1::date, '-infinity'::date)
      order by ${ORDER} limit ${limit}`,
    [from]
  );
  const jobs = await candidateJobs(from);
  const transactions = rows.map(toRow).map((tx) => {
    if (tx.amountPence > 0 && !tx.jobId) tx.suggested = suggest(tx, jobs).map((s) => s.jobId);
    return tx;
  });

  json(res, 200, {
    ok: true, view, from, transactions,
    jobs: jobs.map((j) => ({
      id: j.id, jobDate: j.jobDate, customerName: j.customerName || j.firstName || null, postcode: j.postcode,
      site: j.site, surveyPricePence: j.surveyPricePence, remedialPence: j.remedialPence,
      receivedPence: j.receivedPence, paidAt: j.paidAt, depositPaidAt: j.depositPaidAt
    })),
    totals: await totals(from),
    statements: await statements(),
    categories: CATEGORIES
  });
}

async function doImport(req, res, url) {
  const text = await readText(req, MAX_CSV_BYTES);
  if (text === null) {
    json(res, 413, { ok: false, error: 'too_large' });
    return;
  }
  if (!text.trim()) {
    json(res, 400, { ok: false, error: 'empty' });
    return;
  }
  const result = await importStatement(text, str(url.searchParams.get('name'), 120));
  if (!result.ok) {
    json(res, 400, result);
    return;
  }
  json(res, 200, { ...result, totals: await totals(fromParam(url)), statements: await statements() });
}

async function update(req, res, url, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    json(res, 400, { ok: false, error: 'bad_id' });
    return;
  }
  const tx = await queryOne(`${TX_SELECT} where t.id = $1`, [id]);
  if (!tx) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  const errors = {};
  let category = tx.category;
  let categoryKind = tx.category_kind;
  let split = tx.split || [];
  let splitKind = tx.split_kind;
  let jobId = tx.job_id == null ? null : Number(tx.job_id);
  let matchKind = tx.match_kind;

  if (body.category !== undefined) {
    const c = str(body.category, 30);
    if (!CATEGORY_KEYS.includes(c)) errors.category = 'Unknown category.';
    else { category = c; categoryKind = 'manual'; }
  }
  if (body.split !== undefined) {
    const s = normaliseSplit(body.split);
    if (!s) errors.split = 'A line can only be split between Scott, Tom, Ben and tax.';
    else { split = s; splitKind = 'manual'; }
  }
  if (body.jobId !== undefined) {
    if (body.jobId === null || body.jobId === '') { jobId = null; matchKind = null; }
    else {
      const j = Number(body.jobId);
      if (!Number.isInteger(j) || j <= 0) errors.jobId = 'Choose a job.';
      else if (!(Number(tx.amount_pence) > 0)) errors.jobId = 'Only money in can be matched to a job.';
      else if (!await queryOne(`select id from jobs where id = $1 and status <> 'cancelled'`, [j])) errors.jobId = 'That job does not exist.';
      else { jobId = j; matchKind = 'manual'; }
    }
  }
  if (Object.keys(errors).length) {
    json(res, 400, { ok: false, errors });
    return;
  }

  /* Matched to a job means the job's ledger owns the money. The split is
     cleared rather than kept alongside, so a line can never count twice. */
  if (jobId) {
    split = [];
    if (body.category === undefined) category = 'income';
  }
  const share = shares(Number(tx.amount_pence), split);
  await query(
    `update bank_transactions
        set category = $2, category_kind = $3, split = $4, split_kind = $5,
            ${numbered(SHARE_SET, 6)}, job_id = $10, match_kind = $11, updated_at = now()
      where id = $1`,
    [id, category, categoryKind, split, splitKind, share.scott, share.tom, share.ben, share.tax, jobId, matchKind]
  );

  const changed = [id];
  const taught = body.category !== undefined || body.split !== undefined;
  if (taught && !jobId && body.applyToSimilar !== false && tx.rule_key) {
    await query(
      `insert into bank_rules (key, category, split) values ($1, $2, $3)
       on conflict (key) do update set category = excluded.category, split = excluded.split, updated_at = now()`,
      [tx.rule_key, category, split]
    );
    // Only lines nobody has touched. A choice made on one line by hand is
    // never overwritten by a choice made on another.
    const similar = await query(
      `select id, amount_pence from bank_transactions
        where rule_key = $1 and id <> $2 and job_id is null
          and category_kind = 'auto' and split_kind = 'auto'`,
      [tx.rule_key, id]
    );
    for (const s of similar) {
      const sh = shares(Number(s.amount_pence), split);
      await query(
        `update bank_transactions set category = $2, split = $3, ${numbered(SHARE_SET, 4)}, updated_at = now() where id = $1`,
        [Number(s.id), category, split, sh.scott, sh.tom, sh.ben, sh.tax]
      );
      changed.push(Number(s.id));
    }
  }

  const before = tx.job_id == null ? null : Number(tx.job_id);
  if (before && before !== jobId) await syncJobPayments([before], 'recompute');
  if (jobId) await syncJobPayments([jobId], 'forward');

  const rows = await query(`${TX_SELECT} where t.id = any($1::bigint[]) order by ${ORDER}`, [changed]);
  json(res, 200, {
    ok: true, transactions: rows.map(toRow), similar: changed.length - 1, totals: await totals(fromParam(url))
  });
}

async function remove(req, res, url, body) {
  const sid = Number(body.statementId);
  if (!Number.isInteger(sid) || sid <= 0) {
    json(res, 400, { ok: false, error: 'bad_id' });
    return;
  }
  const affected = (await query(
    'select distinct job_id from bank_transactions where statement_id = $1 and job_id is not null', [sid]
  )).map((r) => Number(r.job_id));
  const gone = await queryOne('delete from bank_statements where id = $1 returning id', [sid]);
  if (!gone) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  await syncJobPayments(affected, 'recompute');
  json(res, 200, { ok: true, totals: await totals(fromParam(url)), statements: await statements() });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  /* Money configuration and the reconciliation: admin only. A worker who is
     granted a business still cannot open its bank. */
  const scope = await requireScope(req, res);
  if (!scope || !requireAdmin(scope, res)) return;

  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET') return await list(req, res);
    if (req.method === 'DELETE') return await remove(req, res, url, await readJson(req));
    if (url.searchParams.get('op') === 'import') return await doImport(req, res, url);
    return await update(req, res, url, await readJson(req));
  } catch (err) {
    console.error('bank request failed:', err.message);
    json(res, 500, { ok: false, error: 'bank_failed' });
  }
}
