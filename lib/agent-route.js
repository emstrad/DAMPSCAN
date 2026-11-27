/**
 * The estate agent's page through /api/quote (doc=agent), here rather than a
 * new api file: the plan allows twelve. GET draws their properties (and, with
 * file=report&job=N, a report that has opened); POST is Quick book, confirming
 * access or asking for another time (lib/agent-book.js).
 */
import { json, ipHash, str } from './http.js';
import { rateLimit, LIMITS } from './ratelimit.js';
import { agentByToken, agentView, agentJob } from './agent-portal.js';
import { quickBook, confirmAccess, askAnother } from './agent-book.js';
import { findPortal, portalReport } from './portal.js';
import { logEvent } from './portal-events.js';

export async function agentGet(req, res, params) {
  const a = await agentByToken(params.get('t'));
  if (!a) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  if (params.get('file') === 'report' || params.get('file') === 'report2') {
    const j = await agentJob(Number(a.id), a.site, params.get('job'));
    const found = j && j.portal_token ? await findPortal(j.portal_token) : null;
    if (!found || !found.job) { json(res, 404, { ok: false, error: 'not_ready' }); return; }
    await logEvent(found.job.id, 'agent_report', { detail: a.name }).catch(() => {});
    return portalReport(req, res, found.job, { agent: true, second: params.get('file') === 'report2' });
  }
  /* A refresh on coming back to the tab (again=1) is not another open. */
  json(res, 200, { ok: true, page: await agentView(a, undefined, { opened: params.get('again') !== '1' }) });
}

export async function agentPost(req, res, body) {
  const limit = await rateLimit({ ...LIMITS.quote, ipHash: ipHash(req) });
  if (!limit.ok) { json(res, 429, { ok: false, error: 'too_many_requests' }); return; }
  const a = await agentByToken(str(body.t, 80));
  if (!a) { json(res, 404, { ok: false, error: 'not_found' }); return; }
  const out = body.op === 'book' ? await quickBook(a, body)
    : body.op === 'confirm' ? await confirmAccess(a, body.job)
    : body.op === 'another' ? await askAnother(a, body.job, { note: body.note })
    : { error: 'bad_op' };
  if (out.errors) { json(res, 400, { ok: false, errors: out.errors }); return; }
  json(res, out.error ? 400 : 200, out.error ? { ok: false, error: out.error } : { ok: true, ...out });
}
