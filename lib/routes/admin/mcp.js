/**
 * POST /api/admin/mcp
 *
 * The staff area as a Model Context Protocol server, for ChatGPT, Claude or
 * any assistant that speaks it. Streamable HTTP, answered as plain JSON: one
 * JSON-RPC request in, one answer out, nothing kept between calls, which is
 * what a serverless function can do and all the protocol needs here.
 *
 * Every call carries a bearer token from the sign-in in oauth.js. The token
 * is turned into the person's scope exactly as a browser session is, so the
 * assistant sees what that person sees and nothing else. Without a valid
 * token the answer is 401 with the address of the sign-in instructions, which
 * is how the assistant knows to start the sign-in.
 *
 * Changes are the tools marked as writes in lib/mcp/, each of which runs the
 * staff route that makes the same change on screen, so it is validated,
 * scoped and audited under the person's name exactly as a tap would be.
 */
import { whereNow, settledTodos } from '../../journey.js';
import { createHash } from 'node:crypto';
import { queryOne } from '../../db.js';
import { json } from '../../http.js';
import { scopeFor } from '../../access.js';
import { TOOLS } from '../../mcp/tools.js';
import { toolAllowed, REFUSED } from '../../work-only.js';
import { trimmed, reasonOf } from '../../mcp/shared.js';
import { resolveJobArgs } from '../../mcp/find-job.js';
import { saveFailure } from '../../todos.js';
import { sha, originOf } from './oauth.js';
import { actorStore } from '../../actor.js';

export const config = { runtime: 'nodejs' };

const PROTOCOL = '2025-06-18';
const INSTRUCTIONS = 'The staff area for ATi Damp Survey and DampScan (damp surveys), Verge Roofing (roofing) and CoolRight (air conditioning). ' +
  'Amounts ending in Pence are pennies: divide by 100 for pounds. Dates are London time. Customer details are private: do not repeat them outside this conversation. ' +
  'You can read everything this person can see: what needs doing, enquiries, jobs, quotes, the calendar, insights, ratings, over-budget jobs, pages to write and the bank. ' +
  'You can also do the day\'s work: find, add and update clients (a client is the customer on a job; create_job can reuse an existing client), start a job, move it along the board, book it, add notes, costs, time and miles; build a quote from a spoken description ' +
  '(you match it to the price book from list_price_book, then send structured lines to build_quote_from_words), add or remove quote lines, apply templates; ' +
  'create an invoice and get the quote or invoice link; get a customer message (on my way, rating ask, follow-up, reminder, invoice, yearly) as words with WhatsApp, text and email links for the person to tap, then mark it sent; ' +
  'write and publish a job\'s project page and get its Google post; match bank payments to jobs; and mark deposits, paid in full and reports sent, and mark a damp survey as awaiting estate agent confirmation (set_awaiting_agent; setting a time with move_job clears it). ' +
  'Nothing is ever sent to a customer from here: messages go when the person taps a link. ' +
  'Before any change, read back exactly what will happen (customer name, postcode, amounts) and wait for a yes. Never ask the person for a job number: they never see one. Pass the customer\'s name and/or postcode wherever a job is needed; if several match, describe them and ask which. ' +
  'Website enquiries: find_enquiry, close_enquiry (with a reason such as booked elsewhere, not interested, spam, duplicate, no response), reopen_enquiry, and delete_enquiry (managers only; confirm the delete first). ' +
  'After booking a customer who came from a web enquiry, link the enquiry (lead_id on create_job, from find_enquiry) so it shows as converted; close leftovers. ' +
  'At the start of a conversation, if the person asks what is new, what has happened, or says catch me up, call catch_up and say its summary first, then each group. ' +
  'For a day\'s work: brief_me before the day (addresses, phones, what is owed), job_done after a visit, wrap_up_day at the end of it, week_review for how the week went, who_is_on for who is free, handover_job to pass a job to a colleague, log_call after a phone call (or an email or text, with how; it also goes on the Scheduling board), pencil_in to hold a time offered to a customer for 48 hours (held until let go for a buyer waiting on the agent). The Scheduling page is where every ATi and DampScan customer is worked: each answer about one carries scheduler (their stage: New, Contacted, Waiting for time, Waiting on agent, Pencilled, Booked, Surveyed, Report sent, Paid, Closed, Cancelled, and where that sits on the page). Say it back after every change ("Kim is now Booked: on Today and the day lane"). An enquiry can go straight to booked (create_job with its lead_id) or to waiting on the agent (create_job then set_awaiting_agent); move_on_board puts someone not yet booked in New, Contacted or Waiting for time. When an answer has todosLookDone, ask the person whether to tick each off (complete_todo); never tick them without a yes. A damp survey time inside the drive to or from that surveyor\'s other surveys is refused with the reason: read it out and only send force true if they say book it anyway, customer_history for anything a customer has had before. ' +
  'Writing for a customer: at the start of any drafting or message task call get_playbook and write in that style; draft_message gives the facts and any ready message, then links_for gives tap-to-send links for the final words. When the owner says "remember that we always..." or similar, read it back and save it with save_playbook_note. ' +
  'Survey reports: when the person uploads a report in the chat, attach_report saves it on the client\'s card. For the final email, call get_report_file and use the person\'s own Outlook connector to create a draft to the customer with the file attached; never send it yourself. ' +
  'Monday briefing: owner_briefing, then say per business what changed and what needs a decision. Inbox sweep ("sweep my inbox", or a morning task): read the person\'s recent Outlook emails through their own connector, skip newsletters and anything not about a customer, call match_email for each of the rest, then give one numbered list of proposed actions (book, move, pencil in a time, mark paid, add an enquiry, file it whole on their Scheduling card with log_email (direction, subject, the words, when), draft a reply in the playbook\'s style) and do only the ones they say yes to. ' +
  'You may look at the person\'s sent emails through their own Outlook connector, if they have one, to learn their tone; summarise the style, confirm it with them, then save it to the playbook so every colleague\'s assistant writes the same way. Reports: you write the wording, save_report_draft keeps it on the job. ' +
  'When the person asks what you can do, call what_can_you_do and list it plainly. When they ask for something no tool does, check what_can_you_do and say plainly that you cannot, then offer the closest thing you can do. ' +
  'There is a shared to-do list between staff. At the start of a conversation, call list_todos and mention anything open, saying who set it and when. ' +
  'When someone asks you to remind or tell a colleague something, call add_todo with their words exactly as said (not summarised), for that colleague by first name. ' +
  'add_todo answers with a said line: tell the person exactly that, so they know it went on the list. When the person says they have done something that is on the list, call complete_todo. A change that fails is saved to their list automatically; say so.';

function unauthorised(req, res) {
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"`);
  json(res, 401, { error: 'invalid_token', error_description: 'Sign in to the staff area to connect.' });
}

/** The person behind a bearer token, as a scope, or null. */
export async function scopeFromToken(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  const row = await queryOne(
    `update mcp_tokens set last_used_at = now() where token_hash = $1 and kind = 'access' and revoked_at is null and expires_at > now()
     returning person_id, shared`, [sha(m[1])]);
  if (!row) return null;
  const scope = await scopeFor(row.shared ? { person: false, name: 'Owners' } : { person: true, sub: Number(row.person_id) });
  /* Marked so alerts can say a change came through the assistant. */
  return scope && (scope.isAdmin || scope.businesses.length) ? { ...scope, viaAssistant: true } : null;
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function callTool(scope, params) {
  const tool = TOOLS.find((t) => t.name === params.name);
  if (!tool) return { content: [{ type: 'text', text: `There is no tool called ${params.name}.` }], isError: true };
  if (!toolAllowed(scope, tool)) return { content: [{ type: 'text', text: REFUSED }], isError: true };
  /* Whatever a tool answers, a job in it is trimmed to what this person may see of the money. */
  const args = params.arguments || {};
  const resolved = await resolveJobArgs(scope, args);
  if (resolved.error) {
    const saved = await keepFailure(scope, tool, args, resolved.error);
    return { content: [{ type: 'text', text: JSON.stringify(resolved.error) }, ...saved], structuredContent: resolved.error, isError: true };
  }
  /* Tools that skip the routes (the to-do list) still name who acted. */
  const { status, data } = trimmed(await actorStore.run({ scope }, () => tool.run(scope, resolved.args)), scope);
  const failed = status >= 400 || (data && data.ok === false);
  /* Every answer about an ATi or DampScan customer says where they now are on Scheduling. */
  if (!failed && data && typeof data === 'object' && !Array.isArray(data)) await placeOf(data, resolved.args);
  const saved = failed ? await keepFailure(scope, tool, args, data, jobOf(resolved.args)) : [];
  /* A plain sentence first when the tool has one ("Added to Scott's to-do
     list."), so the assistant reports the outcome rather than guessing at it
     from the JSON. */
  const said = data && typeof data.said === 'string' ? [{ type: 'text', text: data.said }]
    : failed ? [{ type: 'text', text: `That did not go through: ${reasonOf(data)}` }] : [];
  return {
    content: [...said, { type: 'text', text: JSON.stringify(data) }, ...saved],
    ...(data && typeof data === 'object' && !Array.isArray(data) ? { structuredContent: data } : {}),
    isError: failed
  };
}

async function placeOf(data, args) {
  try {
    const card = data.card || {};
    const jobId = card.kind === 'job' ? card.id : (data.job && Number.isInteger(Number(data.job.id)) ? Number(data.job.id) : jobOf(args));
    const leadId = card.kind === 'lead' ? card.id : Number.isInteger(args.lead_id) ? args.lead_id : null;
    const where = (jobId || leadId) ? await whereNow({ jobId, leadId }) : null;
    if (!where) return;
    data.scheduler = where;
    /* To-dos the change looks to have done: ChatGPT asks before ticking them (complete_todo). */
    const done = jobId ? await settledTodos(jobId) : [];
    if (done.length) data.todosLookDone = done;
    if (typeof data.said === 'string') data.said += ` Now: ${where.stage} (${where.scheduling}).`;
  } catch (e) { console.warn('could not say where it is:', e.message); }
}

const jobOf = (args) => ['id', 'job', 'job_id', 'client_job_id'].map((k) => args[k]).find(Number.isInteger) || null;

/**
 * A change that did not go through goes on the person's to-do list, so it is
 * not lost when the chat ends. Reads are not kept (nothing was asked to
 * change), nor the to-do tools themselves, nor "which of these jobs?", which
 * is a question the assistant is about to ask rather than a failure.
 */
async function keepFailure(scope, tool, args, data, jobId = null) {
  if (tool.annotations.readOnlyHint || /todo/.test(tool.name)) return [];
  const error = reasonOf(data);
  if (/^More than one job matches/.test(error)) return [];
  try {
    await saveFailure(scope, { title: tool.title, args, error, jobId });
    return [{ type: 'text', text: 'Saved to your to-do list.' }];
  } catch (e) {
    console.warn('could not save failed action:', e.message);
    return [];
  }
}

/* The version follows the tool list, so an assistant that keeps a copy of
   the list by version sees a new one whenever a tool is added or changed. */
const VERSION = '1.' + createHash('sha256').update(JSON.stringify(TOOLS.map(({ run, ...t }) => t))).digest('hex').slice(0, 8);

async function answer(scope, msg) {
  const { id, method, params = {} } = msg || {};
  if (!method) return err(id ?? null, -32600, 'Invalid request');
  if (id === undefined || id === null) return null; // a notification: nothing to say back
  if (method === 'initialize') {
    return ok(id, { protocolVersion: params.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'staff-area', title: 'Staff area', version: VERSION }, instructions: INSTRUCTIONS });
  }
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS.filter((t) => toolAllowed(scope, t)).map(({ run, ...t }) => t) });
  if (method === 'tools/call') {
    try { return ok(id, await callTool(scope, params)); } catch (e) {
      console.error('mcp tool failed:', params.name, e.message);
      const tool = TOOLS.find((t) => t.name === params.name);
      const saved = tool ? await keepFailure(scope, tool, params.arguments || {}, 'the server hit an error') : [];
      return ok(id, { content: [{ type: 'text', text: 'That did not work. Try again in a moment.' }, ...saved], isError: true });
    }
  }
  return err(id, -32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Use POST' });
  }
  const scope = await scopeFromToken(req);
  if (!scope) return unauthorised(req, res);
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (body === undefined) {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 65536) break; }
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') return json(res, 400, err(null, -32700, 'Parse error'));
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => answer(scope, m)))).filter(Boolean);
    if (!out.length) { res.statusCode = 202; return res.end(); }
    return json(res, 200, out);
  }
  const one = await answer(scope, body);
  if (!one) { res.statusCode = 202; return res.end(); }
  return json(res, 200, one);
}
