/**
 * /api/admin/pay: the pay logbook (lib/pay-book.js), Scott and Tom only: the
 * owners' code, or someone who manages both ATi and DampScan.
 *
 *   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD&book=old   the cards, every survey done in that period, the split settings
 *                                         (book=old: the Revolut book before 15 Nov 2026; default the Tide and Stripe one)
 *   GET  ?who=tom                         that person's statement
 *   POST {op:'pay', who, pence, day, how, note, book}  record a payment to them (or into the tax pot); book old settles a Revolut balance
 *   POST {op:'remove', id}                          a payment entered by mistake
 *   POST {op:'split', taxBp, shares:{scott,tom,ben}}   the split new surveys book with
 *   GET  ?view=money&from&to                  the Money tab (lib/company-money.js)
 *   GET  ?view=overview                       the Overview tab (lib/company-overview.js)
 *   GET  ?view=growth                         the Growth tab (lib/company-growth.js)
 *   GET  ?view=agents&site=dampscan            one brand's estate agents, links and statements (lib/agent-referrals.js)
 *   POST {op:'agent', site, name, branch, email, phone}   an agent added before they have sent anyone
 *   GET  ?job=ID                              one survey's split and the money moved on it (lib/pay-moves.js)
 *   POST {op:'move', jobId, from, to, pence, reason} | {op:'unmove', id}   money moved between people on one survey
 *   GET  ?view=week                           the Monday briefing (lib/company-week.js)
 *   GET  ?view=accountant                     the Accountant tab (lib/accountant.js)
 *   GET  ?view=self                           Paying yourselves on Pay (lib/pay-self.js)
 *   GET  ?view=accounts&from&to               the records for the accountant, as CSV (lib/accountant-csv.js)
 *   POST {op:'expense', day, pence, category, what, receipt, bankRef} | {op:'unexpense', id}
 *   POST ?op=tide  a Tide statement (CSV) as the body: the bank check (lib/tide-check.js)
 *   POST {op:'reconcile', line:{ref,day,pence,reference,what}, jobId} | {op:'unreconcile', ref}   a transfer matched to a survey, or undone
 */
import { json, requireMethod, readJson, readText } from '../../http.js';
import { requireScope } from '../../access.js';
import { payBook, statement, recordPayout, removePayout, setSplit } from '../../pay-book.js';
import { moneyView, addExpense, removeExpense } from '../../company-money.js';
import { tideCheck } from '../../tide-check.js';
import { reconcile, unreconcile } from '../../tide-reconcile.js';
import { overview } from '../../company-overview.js';
import { accountantView } from '../../accountant.js';
import { accountsCsv } from '../../accountant-csv.js';
import { paySelf } from '../../pay-self.js';
import { growth } from '../../company-growth.js';
import { agentsView, addAgent } from '../../agent-referrals.js';
import { week } from '../../company-week.js';
import { jobSplit, addMove, removeMove } from '../../pay-moves.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const owner = (scope) => scope.isAdmin || ['dampscan', 'ati-london'].every((s) => scope.levels[s] === 'manage');

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  if (!owner(scope)) return json(res, 403, { ok: false, error: 'forbidden', message: 'Pay is for the owners.' });
  const by = String(scope.name || 'Owners').trim().split(/\s+/)[0];

  if (req.method === 'GET') {
    const q = new URL(req.url || '/', 'http://x').searchParams;
    if (q.get('view') === 'overview') return json(res, 200, { ok: true, ...(await overview()) });
    if (q.get('view') === 'growth') return json(res, 200, { ok: true, ...(await growth()) });
    if (q.get('view') === 'week') return json(res, 200, { ok: true, ...(await week()) });
    if (q.get('view') === 'accountant') return json(res, 200, { ok: true, ...(await accountantView()) });
    if (q.get('view') === 'self') return json(res, 200, { ok: true, ...(await paySelf()) });
    if (q.get('view') === 'accounts') {
      const from = DATE.test(q.get('from') || '') ? q.get('from') : null, to = DATE.test(q.get('to') || '') ? q.get('to') : null;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="damp-surveying-${from || 'start'}-to-${to || 'today'}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end('\ufeff' + (await accountsCsv({ from, to })));
    }
    if (q.get('job')) {
      const sp = await jobSplit(Number(q.get('job')) || 0);
      return sp.error ? json(res, 400, { ok: false, error: sp.error }) : json(res, 200, { ok: true, ...sp });
    }
    if (q.get('view') === 'agents') {
      const a = await agentsView(q.get('site'));
      return a.error ? json(res, 400, { ok: false, error: a.error }) : json(res, 200, { ok: true, ...a });
    }
    if (q.get('view') === 'money') {
      return json(res, 200, { ok: true, ...(await moneyView({ from: DATE.test(q.get('from') || '') ? q.get('from') : null, to: DATE.test(q.get('to') || '') ? q.get('to') : null })) });
    }
    if (q.get('who')) {
      const s = await statement(q.get('who'));
      return s.error ? json(res, 400, { ok: false, error: s.error }) : json(res, 200, { ok: true, ...s });
    }
    const from = DATE.test(q.get('from') || '') ? q.get('from') : null;
    const to = DATE.test(q.get('to') || '') ? q.get('to') : null;
    return json(res, 200, { ok: true, ...(await payBook({ from, to, book: q.get('book') === 'old' ? 'old' : 'new' })) });
  }

  if (new URL(req.url || '/', 'http://x').searchParams.get('op') === 'tide') {
    const text = await readText(req, 2 * 1024 * 1024);
    if (text === null) return json(res, 413, { ok: false, error: 'That file is too large. Export one month.' });
    const out = await tideCheck(text, by);
    return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, { ok: true, ...out });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
  const out = body.op === 'pay' ? await recordPayout(body, by)
    : body.op === 'remove' ? await removePayout(body.id, by)
    : body.op === 'reconcile' ? await reconcile(body.line || {}, body.jobId, by)
    : body.op === 'unreconcile' ? await unreconcile(body.ref, by)
    : body.op === 'agent' ? await addAgent(body, body.site)
    : body.op === 'move' ? await addMove({ jobId: Number(body.jobId) || 0, from: body.from, to: body.to, pence: body.pence, reason: body.reason }, by)
    : body.op === 'unmove' ? await removeMove(Number(body.id) || 0, by)
    : body.op === 'expense' ? await addExpense(body, by)
    : body.op === 'unexpense' ? await removeExpense(body.id, by)
    : body.op === 'split' ? await setSplit(body.shares ? { taxBp: Number(body.taxBp), shares: body.shares } : { taxBp: Number(body.taxBp), leadBp: Number(body.leadBp), leadEarner: body.leadEarner, partnerA: body.partnerA, partnerB: body.partnerB })
    : { error: 'bad_op' };
  return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, { ok: true, ...out });
}
