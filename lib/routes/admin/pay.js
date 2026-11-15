/**
 * /api/admin/pay: the pay logbook (lib/pay-book.js), Scott and Tom only: the
 * owners' code, or someone who manages both ATi and DampScan.
 *
 *   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   the cards, every survey done in that period, the split settings
 *   GET  ?who=tom                         that person's statement
 *   POST {op:'pay', who, pence, day, how, note}     record a payment to them (or into the tax pot)
 *   POST {op:'remove', id}                          a payment entered by mistake
 *   POST {op:'split', taxBp, leadBp, leadEarner, partnerA, partnerB}   the split new surveys book with
 */
import { json, requireMethod, readJson } from '../../http.js';
import { requireScope } from '../../access.js';
import { payBook, statement, recordPayout, removePayout, setSplit } from '../../pay-book.js';

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
    if (q.get('who')) {
      const s = await statement(q.get('who'));
      return s.error ? json(res, 400, { ok: false, error: s.error }) : json(res, 200, { ok: true, ...s });
    }
    const from = DATE.test(q.get('from') || '') ? q.get('from') : null;
    const to = DATE.test(q.get('to') || '') ? q.get('to') : null;
    return json(res, 200, { ok: true, ...(await payBook({ from, to })) });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
  const out = body.op === 'pay' ? await recordPayout(body, by)
    : body.op === 'remove' ? await removePayout(body.id, by)
    : body.op === 'split' ? await setSplit({ taxBp: Number(body.taxBp), leadBp: Number(body.leadBp), leadEarner: body.leadEarner, partnerA: body.partnerA, partnerB: body.partnerB })
    : { error: 'bad_op' };
  return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, { ok: true, ...out });
}
