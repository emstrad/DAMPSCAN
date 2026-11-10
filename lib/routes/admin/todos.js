/**
 * /api/admin/todos
 *
 *   GET   ?view=open|mine|set|failed|done|all   the to-dos this person may see,
 *                                               plus the people they can set one for
 *   POST  {op, ...}
 *     add     {text, forPersonId?, site?, dueOn?, jobId?, leadId?}   forPersonId null is everyone,
 *                                                 "owners" the owners' own list
 *     done    {id}
 *     reopen  {id}
 *
 * The staff screen for the shared to-do list. The assistant's tools in
 * lib/mcp/todo-tools.js call the same functions in lib/todos.js, so the
 * scoping and audit rows are the same whichever way a to-do arrives.
 */
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope } from '../../access.js';
import { normaliseSite } from '../../site.js';
import { listTodos, teamFor, addTodo, setDone, ownerNames, VIEWS } from '../../todos.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  try {
    if (req.method === 'GET') {
      const view = new URL(req.url, 'http://localhost').searchParams.get('view') || 'open';
      if (!VIEWS.includes(view)) return json(res, 400, { ok: false, error: 'bad_view' });
      const [todos, team] = await Promise.all([listTodos(scope, view), teamFor(scope)]);
      /* The owners' code has no people row, so it is not in the team list;
         this names its own list so the form can offer "Scott (me)". */
      const owners = scope.personId ? null : ownerNames().join(' and ') || 'Owners';
      return json(res, 200, { ok: true, view, me: scope.personId, owners, todos, people: team.map((p) => ({ id: Number(p.id), name: p.name })) });
    }
    const body = await readJson(req);
    let out;
    if (body.op === 'add') {
      const forPersonId = Number(body.forPersonId) > 0 ? Number(body.forPersonId) : null;
      const forOwners = body.forPersonId === 'owners';
      out = await addTodo(scope, { text: str(body.text, 2000), forPersonId, forOwners, site: normaliseSite(body.site) || null, dueOn: str(body.dueOn, 10), jobId: Number(body.jobId) > 0 ? Number(body.jobId) : null, leadId: Number(body.leadId) > 0 ? Number(body.leadId) : null, source: 'manual' });
    } else if (body.op === 'done' || body.op === 'reopen') {
      out = await setDone(scope, Number(body.id), body.op === 'done');
    } else {
      return json(res, 400, { ok: false, error: 'bad_op' });
    }
    if (out.error) return json(res, out.error.startsWith('No such') ? 404 : 400, { ok: false, error: out.error });
    return json(res, 200, { ok: true, todo: out.todo });
  } catch (err) {
    console.error('todos request failed:', err.message);
    return json(res, 500, { ok: false, error: 'todos_failed' });
  }
}
