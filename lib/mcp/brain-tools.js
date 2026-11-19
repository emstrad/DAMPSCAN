/**
 * The brain, read by ChatGPT and Claude (the owner, 19 Nov 2026: "one
 * conclusive brain that knows everything that's going on"). Three tools over
 * what the database keeps by itself:
 *   whats_next        the What's next page: every open customer, one step each;
 *   customer_story    one customer's whole record: every change the journal
 *                     kept, every email read whole, the questions open;
 *   answer_brain_question  yes or no to what the brain would not do alone.
 * Managers of the business only, since all three carry money.
 */
import { query, queryOne } from '../db.js';
import { callRoute, read, write, fail, canManage } from './shared.js';
import { searchTerms, haystack, scoreSql, likeParams, bestOnly } from '../find-words.js';
import { answerAsk } from '../brain-asks.js';
import todos from '../routes/admin/todos.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const managed = (scope) => (scope.businesses || []).filter((s) => canManage(scope, s));
const pounds = (p) => (p == null ? null : `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`);

async function whatsNext(scope, { lane } = {}) {
  if (!managed(scope).length) return fail('What\'s next is for managers.');
  const out = await callRoute(todos, scope, { url: '/api/admin/todos?view=next' });
  if (out.status >= 400) return out;
  const want = lane === 'you' ? ['now', 'us'] : lane ? [lane] : null;
  const rows = (out.data.rows || []).filter((r) => !want || want.includes(r.lane)).map((r) => ({
    customer: r.name, postcode: r.postcode, business: r.site, lane: r.lane === 'now' ? 'needs you now' : r.lane === 'us' ? 'you' : r.lane,
    next: r.next, why: r.why || null, since: r.since || null, lastContact: r.lastContact || null, owed: pounds(r.owedPence), oldMoney: Boolean(r.oldMoney),
    question: r.ask ? r.ask.say : null, todos: (r.todos || []).map((t) => t.text)
  }));
  return ok({ counts: out.data.counts, rows,
    tip: 'Say Needs you now first, then each lane with a count, one line per customer: the next step and why. A question is the brain asking: read it out and offer answer_brain_question.' });
}

/** The one customer meant: jobs first, then enquiries that never became one. */
async function findOne(scope, words) {
  if (!managed(scope).length) return { error: 'The brain is for managers.' };
  const terms = searchTerms(words);
  if (!terms.length) return { error: 'Give a name, postcode, phone or email.' };
  const sites = managed(scope);
  const jh = haystack({ name: 'customer_name', email: 'customer_email', phone: 'customer_phone', postcode: 'customer_postcode', address: 'customer_address' });
  const lh = haystack({ name: 'first_name', email: 'email', phone: 'phone', postcode: 'postcode', address: 'address_line1' });
  const p = likeParams(terms);
  const rows = bestOnly([
    ...(await query(`select 'job' as kind, id, lead_id, site, customer_name as name, customer_postcode as postcode, ${scoreSql(jh, terms, 2)} as score
        from jobs where site = any($1::text[]) and status not in ('cancelled', 'declined') order by created_at desc limit 200`, [sites, ...p])),
    ...(await query(`select 'lead' as kind, id, id as lead_id, site, first_name as name, postcode, ${scoreSql(lh, terms, 2)} as score
        from leads where site = any($1::text[]) and stage = 'complete' and closed_at is null and not exists (select 1 from jobs where lead_id = leads.id)
        order by created_at desc limit 200`, [sites, ...p]))
  ]);
  if (!rows.length) return { none: true };
  if (rows.length > 1) return { many: rows.slice(0, 8).map((r) => ({ customer: r.name, postcode: r.postcode, business: r.site, kind: r.kind === 'job' ? 'survey' : 'enquiry' })) };
  return { one: rows[0] };
}

async function customerStory(scope, { words, limit = 60 }) {
  const f = await findOne(scope, words);
  if (f.error) return fail(f.error);
  if (f.none) return ok({ matches: [], said: 'Nobody matches those words in the businesses you manage.' });
  if (f.many) return ok({ matches: f.many, tip: 'Several match: say who they are and ask which.' });
  const c = f.one;
  const jobId = c.kind === 'job' ? Number(c.id) : null;
  const leadId = c.lead_id ? Number(c.lead_id) : null;
  const n = Math.min(Math.max(Number(limit) || 60, 5), 200);
  const [changes, mail, state, asks] = await Promise.all([
    query(`select at, source, op, changes from journal where (job_id = $1 or lead_id = $2) order by at desc, id desc limit $3`, [jobId, leadId, n]),
    query(`select at, dir, subject, left(body, 3000) as body, attachments, action from mail_items where (job_id = $1 or lead_id = $2) order by at desc limit 20`, [jobId, leadId]),
    queryOne(`select stage, lane, next_step, why, since, owed_pence, old_money, computed_at from customer_state where key = $1`, [jobId ? `job-${jobId}` : `lead-${leadId}`]),
    jobId ? query(`select say, kind, at from brain_asks where job_id = $1 and status = 'open'`, [jobId]) : []
  ]);
  return ok({
    customer: c.name, postcode: c.postcode, business: c.site, kind: jobId ? 'survey' : 'enquiry',
    now: state ? { stage: state.stage, lane: state.lane, next: state.next_step, why: state.why, since: state.since, owed: pounds(state.owed_pence), oldMoney: state.old_money, asOf: state.computed_at } : null,
    questions: asks.map((a) => a.say),
    emails: mail.map((m) => ({ at: m.at, from: m.dir === 'in' ? 'them' : 'us', subject: m.subject, body: m.body, attachments: (m.attachments || []).map((a) => a.name), brainDid: m.action })),
    changes: changes.map((j) => ({ at: j.at, what: `${j.source} ${j.op}`, changes: j.changes })),
    tip: 'Tell the story in time order in plain words: how they came in, every contact, booking, money and report, then where they are now and the next step. Never read out field names.'
  });
}

async function answerQuestion(scope, { words, yes }) {
  const f = await findOne(scope, words);
  if (f.error) return fail(f.error);
  if (f.none) return fail('Nobody matches those words in the businesses you manage.');
  if (f.many) return ok({ matches: f.many, tip: 'Several match: say who they are and ask which.' });
  if (f.one.kind !== 'job') return fail('The brain has no question open about them.');
  const a = await queryOne(`select id, say from brain_asks where job_id = $1 and status = 'open' order by at limit 1`, [f.one.id]);
  if (!a) return fail('The brain has no question open about them.');
  const out = await answerAsk(scope, Number(a.id), yes === true);
  if (out.error) return fail(out.error);
  return ok({ question: a.say, said: `${f.one.name}: ${out.said}` });
}

const WORDS = { type: 'string', description: 'The customer\'s name and/or postcode, phone or email, as the person said it.' };

export const BRAIN_TOOLS = [
  read('whats_next', 'What\'s next', 'The What\'s next page: every open ATi and DampScan customer once (and Verge and CoolRight work), each with one next step, why and since when, the last contact, money owed, an old money flag, their to-dos and any question the brain has, in lanes: needs you now, you, them, agent, booked, cold. lane narrows it. Managers only.',
    { lane: { type: 'string', enum: ['you', 'now', 'them', 'agent', 'booked', 'cold'] } }, whatsNext),
  read('customer_story', 'Customer story', 'Everything the brain holds about one customer, from their words: where they are now and the next step, every email read whole (ours and theirs, with what the brain did about it), the questions open, and every change ever made to their card, enquiry, texts, payments and to-dos, by anyone or anything, newest first. Managers only.',
    { words: WORDS, limit: { type: 'integer', description: 'How many changes, 5 to 200 (60).' } }, customerStory),
  write('answer_brain_question', 'Answer the brain', 'Answers the brain\'s open question about a customer (shown on What\'s next, such as "Looks paid in full: our email thanked them for their payment"). yes true does it as a person\'s tick would (history, texts and money follow); false lets it go for good.',
    { words: WORDS, yes: { type: 'boolean' } }, ['words', 'yes'], answerQuestion)
];
