/**
 * /api/admin/bank
 *
 *   GET     ?books=&view=attention|in|out|all&from=YYYY-MM-DD
 *           one set of books: the lines, the jobs they could be matched to,
 *           the reconciliation, and which other books the viewer may open
 *   POST    ?books=&op=import&name=file.csv   the statement itself as the body
 *   POST    ?books= {id, category?, split?, jobId?, applyToSimilar?}   change one line
 *   DELETE  ?books= {statementId}   take an upload out again
 *
 * Every request is about one set of books, damp's unless asked otherwise, and
 * a line, statement or job in another set is not found here. A line is either
 * matched to a job or split between people, never both: a matched payment's
 * owners are whatever the job's own ledger says. Choosing a category or a
 * split by hand also teaches the importer for those books, and by default the
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
import { TX_SELECT, ORDER, VIEW_KEYS, viewClause, toRow, candidateJobs, syncPayments, totals, statements } from '../../bank/ledger.js';
import { listBooks } from '../../bank/books.js';
import { writeAllocation, teach } from '../../bank/store.js';
import { importStatement } from '../../bank/import.js';

export const config = { runtime: 'nodejs' };

/* Just under what Vercel will carry into a function. A year of Revolut is a
   few hundred kilobytes. */
const MAX_CSV_BYTES = 4 * 1024 * 1024;
const MAX_LIMIT = 500;

function fromParam(url) {
  const v = url.searchParams.get('from');
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const publicBooks = (b) => ({ key: b.key, name: b.name, model: b.model, sites: b.sites, targets: b.targets.map((t) => ({ key: t.key, name: t.name })) });

async function list(req, res, url, books, all) {
  const param = url.searchParams.get('view') || 'attention';
  const view = VIEW_KEYS.includes(param) ? param : 'attention';
  const from = fromParam(url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || MAX_LIMIT));

  const rows = await query(
    `${TX_SELECT} where t.books = $1 and ${viewClause(view, books.model)} and t.posted_on >= coalesce($2::date, '-infinity'::date)
      order by ${ORDER} limit ${limit}`,
    [books.key, from]
  );
  const jobs = await candidateJobs(from, books);
  const transactions = rows.map(toRow).map((tx) => {
    if (tx.amountPence > 0 && !tx.jobId) tx.suggested = suggest(tx, jobs).map((s) => s.jobId);
    return tx;
  });

  json(res, 200, {
    ok: true, view, from, transactions,
    books: publicBooks(books),
    allBooks: all.map((b) => ({ key: b.key, name: b.name, model: b.model })),
    jobs: jobs.map((j) => ({
      id: j.id, jobDate: j.jobDate, customerName: j.customerName || j.firstName || null, postcode: j.postcode,
      site: j.site, surveyPricePence: j.surveyPricePence, remedialPence: j.remedialPence,
      receivedPence: j.receivedPence, paidAt: j.paidAt, depositPaidAt: j.depositPaidAt
    })),
    totals: await totals(from, books),
    statements: await statements(books),
    categories: CATEGORIES
  });
}

async function doImport(req, res, url, books) {
  const text = await readText(req, MAX_CSV_BYTES);
  if (text === null) {
    json(res, 413, { ok: false, error: 'too_large' });
    return;
  }
  if (!text.trim()) {
    json(res, 400, { ok: false, error: 'empty' });
    return;
  }
  const result = await importStatement(text, str(url.searchParams.get('name'), 120), books);
  if (!result.ok) {
    json(res, 400, result);
    return;
  }
  json(res, 200, { ...result, totals: await totals(fromParam(url), books), statements: await statements(books) });
}

async function update(req, res, url, body, books) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    json(res, 400, { ok: false, error: 'bad_id' });
    return;
  }
  const tx = await queryOne(`${TX_SELECT} where t.id = $1 and t.books = $2`, [id, books.key]);
  if (!tx) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  const targets = books.targets.map((t) => t.key);

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
    const s = normaliseSplit(body.split, targets);
    if (!s) errors.split = `A line here can only be split between ${books.targets.map((t) => t.name).join(', ')}.`;
    else { split = s; splitKind = 'manual'; }
  }
  if (body.jobId !== undefined) {
    if (body.jobId === null || body.jobId === '') { jobId = null; matchKind = null; }
    else {
      const j = Number(body.jobId);
      if (!Number.isInteger(j) || j <= 0) errors.jobId = 'Choose a job.';
      else if (!(Number(tx.amount_pence) > 0)) errors.jobId = 'Only money in can be matched to a job.';
      else if (!await queryOne(`select id from jobs where id = $1 and site = any($2::text[]) and status not in ('cancelled', 'declined')`, [j, books.sites])) errors.jobId = 'That job does not exist.';
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
  await writeAllocation(id, {
    category, categoryKind, split, splitKind, shares: shares(Number(tx.amount_pence), split, targets), jobId, matchKind
  });

  const changed = [id];
  const taught = body.category !== undefined || body.split !== undefined;
  if (taught && !jobId && body.applyToSimilar !== false && tx.rule_key) {
    changed.push(...await teach(books, tx, category, split, targets));
  }

  const before = tx.job_id == null ? null : Number(tx.job_id);
  if (before && before !== jobId) await syncPayments(books, [before], 'recompute');
  if (jobId) await syncPayments(books, [jobId], 'forward');

  const rows = await query(`${TX_SELECT} where t.id = any($1::bigint[]) order by ${ORDER}`, [changed]);
  json(res, 200, {
    ok: true, transactions: rows.map(toRow), similar: changed.length - 1, totals: await totals(fromParam(url), books)
  });
}

async function remove(req, res, url, body, books) {
  const sid = Number(body.statementId);
  if (!Number.isInteger(sid) || sid <= 0) {
    json(res, 400, { ok: false, error: 'bad_id' });
    return;
  }
  const affected = (await query(
    'select distinct job_id from bank_transactions where statement_id = $1 and job_id is not null', [sid]
  )).map((r) => Number(r.job_id));
  const gone = await queryOne('delete from bank_statements where id = $1 and books = $2 returning id', [sid, books.key]);
  if (!gone) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  await syncPayments(books, affected, 'recompute');
  json(res, 200, { ok: true, totals: await totals(fromParam(url), books), statements: await statements(books) });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;
  /* Money configuration and the reconciliation: admin only. A worker who is
     granted a business still cannot open its bank. */
  const scope = await requireScope(req, res);
  if (!scope || !requireAdmin(scope, res)) return;

  const url = new URL(req.url, 'http://localhost');
  try {
    const all = await listBooks(scope);
    const wanted = url.searchParams.get('books');
    const books = wanted ? all.find((b) => b.key === wanted) : all[0];
    if (!books) {
      json(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    if (req.method === 'GET') return await list(req, res, url, books, all);
    if (req.method === 'DELETE') return await remove(req, res, url, await readJson(req), books);
    if (url.searchParams.get('op') === 'import') return await doImport(req, res, url, books);
    return await update(req, res, url, await readJson(req), books);
  } catch (err) {
    console.error('bank request failed:', err.message);
    json(res, 500, { ok: false, error: 'bank_failed' });
  }
}
