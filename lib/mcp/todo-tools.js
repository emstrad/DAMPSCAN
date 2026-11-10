/**
 * The shared to-do list from the assistant: "tell Scott about a potential job
 * next week, name Laura", "anything on my list?", "I've rung Laura".
 *
 * add_todo keeps the person's words exactly, so whoever reads it later hears
 * what was meant rather than the assistant's summary of it. A customer said
 * in words becomes the job when exactly one matches and otherwise stays as
 * free text, because a to-do is often about somebody who is not a job yet.
 */
import { listTodos, addTodo, setDone, matchTodos, resolvePerson, jobFromWords, getTodo, present, ownerNames } from '../todos.js';
import { read, write, fail, SITE, DATE } from './shared.js';
import { resolveLead } from '../lead-status.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });

/* "Tom and Dan" or "Tom, Dan" gives each of them their own copy. */
async function add(scope, args) {
  const names = String(args.for || '').split(/\s*(?:,|&|\band\b)\s*/i).map((n) => n.trim()).filter(Boolean);
  if (names.length < 2) return addOne(scope, args);
  const said = [];
  for (const n of names) {
    const r = await addOne(scope, { ...args, for: n });
    /* Copies already made stay made, so say which, or a retry doubles them. */
    if (r.status !== 200) return { status: r.status, data: { ...r.data, error: said.length ? `${r.data.error} Already done: ${said.join(' ')} Do not add those again.` : r.data.error, added: said } };
    said.push(r.data.said);
  }
  return ok({ added: said.length, said: said.join(' ') });
}

async function addOne(scope, { text, for: who, customer, due_on: dueOn, business }) {
  const target = await resolvePerson(scope, who);
  if (target.error) return fail(target.error);
  const jobId = await jobFromWords(scope, customer);
  /* Not a job yet: the one open enquiry it names, so it shows on their Scheduling card. */
  const enq = customer && !jobId && !/^\d+$/.test(String(customer).trim()) ? await resolveLead(scope, customer).catch(() => ({})) : {};
  const leadId = enq.id || null;
  const crew = target.crew ? target.crew[0].toUpperCase() + target.crew.slice(1) : null;
  const out = await addTodo(scope, {
    text: crew ? `For ${crew}: ${text}` : text, forPersonId: target.person ? target.person.id : null, forOwners: Boolean(target.owners), site: business || null, jobId, leadId,
    lead: customer && !jobId ? customer : null, dueOn: dueOn || null, source: 'assistant'
  });
  if (out.error) return fail(out.error);
  /* Said in full so the assistant can tell the person plainly that it worked. */
  const whose = target.person ? (target.person.id === scope.personId ? 'your own' : `${target.person.name}'s`)
    : crew ? `the owners' (for ${crew})` : target.owners ? `${ownerNames().join(' and ') || 'the owners'}'s` : 'everyone\'s';
  const extra = [out.todo.customer || out.todo.lead, out.todo.dueOn && `due ${out.todo.dueOn}`].filter(Boolean).join(', ');
  return ok({ todo: out.todo, said: `Added to ${whose} to-do list${extra ? ` (${extra})` : ''}.` });
}

async function list(scope, { view }) {
  const todos = await listTodos(scope, view || 'open');
  return ok({ view: view || 'open', count: todos.length, todos,
    tip: todos.length ? 'Tell the person each one in their own words, who set it and when, and any due date.' : 'Nothing on the list.' });
}

/** By id, or by words; several matches come back to be asked about. */
async function tick(scope, { id, text }, done) {
  let target = Number.isInteger(id) ? id : null;
  if (!target) {
    const found = await matchTodos(scope, text, { done: !done });
    if (found.length !== 1) {
      return found.length
        ? { status: 409, data: { ok: false, error: 'More than one to-do matches. Ask which, then call again with its id.', matches: found } }
        : fail(`Nothing ${done ? 'open' : 'done'} on the list matches "${text || ''}".`);
    }
    target = found[0].id;
  }
  const out = await setDone(scope, target, done);
  if (out.error) return fail(out.error);
  return ok({ todo: out.todo });
}

async function one(scope, { id }) {
  const row = await getTodo(scope, id);
  return row ? ok({ todo: present(row) }) : fail('No such to-do on your list.');
}

const BY = {
  id: { type: 'integer', description: 'The to-do id from list_todos.' },
  text: { type: 'string', description: 'Or words from the to-do or its customer, e.g. "Laura".' }
};

export const TODO_TOOLS = [
  read('list_todos', 'To-do list', 'The shared staff to-do list. view: open (default: open items for me plus unassigned ones in my businesses), mine (only for me), set (ones I set for others), failed (changes the assistant could not make), done (done in the last fortnight), all (every open one I can see). Each says who set it and when.',
    { view: { type: 'string', enum: ['open', 'mine', 'set', 'failed', 'done', 'all'] }, id: { type: 'integer', description: 'One to-do only.' } },
    (scope, args) => (Number.isInteger(args.id) ? one(scope, args) : list(scope, args))),
  write('add_todo', 'Add a to-do', 'Adds to the shared staff to-do list. Pass text exactly as the person said it, word for word, not summarised. for is a first name ("Scott", "Tom"), several names ("Tom and Dan", each gets a copy), "me", "owners" or "everyone" (one shared item everyone sees). Leave business out unless the person names one. The said line in the answer is what to tell the person. customer is a name and/or postcode; it links the job when one matches, else the one enquiry it names (shown on their Scheduling card), and is kept as a note when neither.',
    { text: { type: 'string' }, for: { type: 'string' }, customer: { type: 'string' }, due_on: DATE, business: SITE }, ['text'], add),
  write('complete_todo', 'Tick off a to-do', 'Marks a to-do done, by id or by matching words or customer. Use when the person says they did something on the list.', BY, [], (scope, args) => tick(scope, args, true), { idempotent: true }),
  write('reopen_todo', 'Reopen a to-do', 'Puts a done to-do back on the list.', BY, [], (scope, args) => tick(scope, args, false), { idempotent: true })
];
