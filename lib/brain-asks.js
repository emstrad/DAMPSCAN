/**
 * Answering what the brain will not do by itself (brain_asks, lib/mail-brain.js).
 * Yes does it through the same route as a person's tick, so the history,
 * texts and money all follow as if ticked by hand (old money stays quiet);
 * Not right lets it go for good. Managers of that business only.
 */
import { query, queryOne } from './db.js';
import { callRoute } from './mcp/shared.js';
import clients from './routes/admin/clients.js';

export async function answerAsk(scope, id, yes) {
  const a = await queryOne(`select id, job_id, site, kind, status from brain_asks where id = $1`, [id]);
  if (!a || a.status !== 'open') return { error: 'That has already been answered.' };
  if (!(scope.isAdmin || (scope.levels || {})[a.site] === 'manage')) return { error: 'Only a manager can answer that.' };
  if (yes && a.kind === 'looks_paid') {
    const out = await callRoute(clients, scope, { method: 'POST', url: '/api/admin/clients', body: { id: Number(a.job_id), paid: true } });
    if (out.status >= 400) return { error: 'It could not be ticked. Open the card.' };
  }
  await query(`update brain_asks set status = $2, decided_by = $3, decided_at = now() where id = $1`, [id, yes ? 'yes' : 'no', scope.name || 'Staff']);
  return { said: yes ? 'Ticked paid in full.' : 'Let go.' };
}
