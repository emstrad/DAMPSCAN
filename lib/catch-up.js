/**
 * "What's happened since I last checked?", for the assistant's catch_up.
 *
 * Read from what is already written: the notifications (every change and
 * every payment says itself there), the audit rows that say more than the
 * alert did (a ticked report, a closed enquiry), the enquiries themselves and
 * the to-do list. Nothing new is recorded to make this work except who acted,
 * which notify() and record() now keep (lib/actor.js).
 *
 * Customers are named the lock screen way ("Sarah, BR6"), because the alerts
 * this reads were already written that way, and the rest is kept to match.
 * Money is cut out of a line for anyone who works on a business but does not
 * manage it, as everywhere else the assistant answers them.
 */
import { query, queryOne } from './db.js';
import { customer, brandName } from './alert-words.js';
import { actorKey } from './actor.js';
import { canManage } from './mcp/shared.js';

export const GROUPS = [
  ['enquiries', 'New enquiries'], ['bookings', 'Bookings and moves'], ['payments', 'Payments and ticks'],
  ['reports', 'Reports sent'], ['quotes', 'Quotes and invoices'], ['closures', 'Deletions and closures'],
  ['todos', 'To-dos for you'], ['other', 'Anything else']
];
const DAY = 86400000;
const MAX_BACK = 31 * DAY;
const PER_GROUP = 40;

/* The website's own alerts are replaced by the enquiries themselves, and the
   to-do alerts by the list; the weekly summary is not news. */
const SKIP_KINDS = ['enquiry', 'lead_partial', 'todo', 'weekly', 'briefing'];
/* Said better by the audit row for the same change. */
const SAID_BY_AUDIT = /updated the client card|updated an enquiry|deleted the job/;
const JOB_KINDS = new Set(['payment', 'job_created', 'job_status', 'job', 'invoice_overdue', 'materials']);

function offsetMinutes(d) {
  const z = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(z);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
/** Midnight in London on a YYYY-MM-DD, as a Date. */
export function londonMidnight(date) {
  const guess = new Date(date + 'T00:00:00Z');
  return new Date(guess.getTime() - offsetMinutes(guess) * 60000);
}
const londonDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** "yesterday", "today", "12" or "12 hours", "3 days", or a date or time. Null when not understood. */
export function parseSince(words, now = new Date()) {
  const w = String(words).trim().toLowerCase();
  let at = null;
  if (w === 'today') at = londonMidnight(londonDate(now));
  else if (w === 'yesterday') at = londonMidnight(londonDate(new Date(now.getTime() - DAY)));
  else if (/^\d+(\.\d+)?\s*(h|hrs?|hours?)?$/.test(w)) at = new Date(now.getTime() - parseFloat(w) * 3600000);
  else if (/^\d+\s*(d|days?)$/.test(w)) at = new Date(now.getTime() - parseInt(w, 10) * DAY);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(w)) at = londonMidnight(w);
  else if (/^\d{4}-\d{2}-\d{2}t/.test(w) && !Number.isNaN(Date.parse(words))) at = new Date(words);
  if (!at || Number.isNaN(at.getTime())) return null;
  return new Date(Math.max(at.getTime(), now.getTime() - MAX_BACK));
}

/** "Thu 15 Oct, 2:05pm" in London time. */
export function whenOf(at) {
  const d = new Date(at);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const t = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '').replace(':00', '');
  return `${day}, ${t}`;
}

/** A line with the pounds taken out, for someone who does not see money. */
export function hideMoney(text) {
  return String(text)
    .replace(/\s*\(£[\d,.]+\)/g, '')
    .replace(/\ba £[\d,.]+ /g, 'a ')
    .replace(/,?\s*£[\d,.]+/g, '')
    .replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim();
}

/** Which heading a change goes under. */
export function groupOf(kind, text) {
  if (kind === 'payment') return 'payments';
  if (['job_created', 'job_status', 'job', 'diary'].includes(kind)) return 'bookings';
  if (kind === 'invoice_overdue') return 'quotes';
  const t = String(text || '').toLowerCase();
  if (/payment|deposit|paid|bank/.test(t)) return 'payments';
  if (/report sent/.test(t)) return 'reports';
  if (/\b(deleted|removed|ended|closed)\b/.test(t)) return 'closures';
  if (/quote|invoice|markup|template/.test(t)) return 'quotes';
  if (/booked|moved|added a job|edited the job|for (mon|tue|wed|thu|fri|sat|sun) /.test(t)) return 'bookings';
  return 'other';
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* An activity alert reads "Tom (via ChatGPT) booked Sarah, BR6."; the who is said separately. */
function withoutWho(message, name) {
  const raw = String(name || '').replace(/^ChatGPT via /, '');
  return raw ? String(message).replace(new RegExp(`^${esc(raw)}( \\(via ChatGPT\\))? `), '') : String(message);
}

async function jobWho(id) {
  if (id == null) return null;
  const j = await queryOne('select customer_name, customer_postcode from jobs where id = $1', [id]);
  return j ? customer(j.customer_name, j.customer_postcode) : null;
}

/* What an audit row says that its alert did not. */
async function fromAudit(r) {
  const b = r.before_json || {}, a = r.after_json || {};
  /* The assistant's own changes (a call logged, a handover) say themselves. */
  if (typeof a.said === 'string') return [[a.group || 'other', a.said, a.customer || null]];
  if (r.entity === 'lead') {
    const lead = (await queryOne('select first_name, postcode from leads where id = $1', [r.entity_id])) || b;
    const who = customer(lead.first_name, lead.postcode);
    if (r.action === 'close') return [['closures', `closed the enquiry from ${who}${a.closed_reason ? ` (${a.closed_reason})` : ''}`, who]];
    if (r.action === 'delete') return [['closures', `deleted the enquiry from ${who}`, who]];
    if (r.action === 'reopen') return [['other', `reopened the enquiry from ${who}`, who]];
    return [];
  }
  if (r.entity === 'job' && r.action === 'job_delete') { const who = customer(b.customerName, b.customerPostcode); return [['closures', `deleted the job for ${who}`, who]]; }
  if (r.entity === 'job' && r.action === 'client_update') {
    const who = (await jobWho(r.entity_id)) || 'a customer';
    const out = [];
    if (!b.surveySentAt && a.surveySentAt) out.push(['reports', `marked the report sent for ${who}`, who]);
    if (!b.depositPaidAt && a.depositPaidAt) out.push(['payments', `ticked the deposit paid for ${who}`, who]);
    if (!b.paidAt && a.paidAt) out.push(['payments', `ticked paid in full for ${who}`, who]);
    if (b.jobDate !== a.jobDate || b.jobTime !== a.jobTime) out.push(['bookings', `moved ${who} to ${a.jobDate || 'no date'}${a.jobTime ? ' at ' + String(a.jobTime).slice(0, 5) : ''}`, who]);
    return out.length ? out : [['other', `updated the client card for ${who}`, who]];
  }
  return [];
}

/** The digest for one person, from `since` to `until`. Reads only. */
export async function digest(scope, { since, until = new Date(), includeMine = false }) {
  const me = actorKey(scope);
  const sites = scope.businesses;
  const admin = Boolean(scope.isAdmin);
  const mine = (key) => !includeMine && key === me;
  const items = [];
  const add = (group, { at, who, site, cust, what }) => {
    const words = (site ? canManage(scope, site) : admin) ? what : hideMoney(what);
    items.push({ group, at: new Date(at).toISOString(), when: whenOf(at), who, business: site ? brandName(site) : null, customer: cust || null, what: words, line: `${whenOf(at)}, ${who}: ${words}` });
  };
  /* Rows are stamped to the microsecond and a JavaScript date only holds
     milliseconds, so both sides are compared at millisecond precision; a
     change made in the same millisecond as the check is then never lost. */
  const span = [since, until];

  const leads = await query(`select id, site, first_name, postcode, created_at from leads where stage = 'complete' and site = any($1::text[]) and date_trunc('milliseconds', created_at) > $2 and date_trunc('milliseconds', created_at) <= $3 order by created_at`, [sites, ...span]);
  for (const l of leads) { const c = customer(l.first_name, l.postcode); add('enquiries', { at: l.created_at, who: 'Website', site: l.site, cust: c, what: `new enquiry from ${c} (${brandName(l.site)})` }); }

  const notes = await query(`select kind, ref, business_slug, title, message, actor_key, actor_name, created_at from notifications
      where date_trunc('milliseconds', created_at) > $2 and date_trunc('milliseconds', created_at) <= $3 and kind <> all($4::text[]) and (business_slug = any($1::text[]) or (business_slug is null and $5))
      order by created_at`, [sites, ...span, SKIP_KINDS, admin]);
  for (const n of notes) {
    if (mine(n.actor_key)) continue;
    if (n.kind === 'activity' && SAID_BY_AUDIT.test(n.message)) continue;
    const who = n.actor_name || (n.kind === 'activity' ? 'Someone' : 'Automatic');
    const what = n.kind === 'activity' ? withoutWho(n.message, n.actor_name).replace(/\.$/, '') : `${n.title}. ${n.message}`.replace(/\.$/, '');
    const cust = JOB_KINDS.has(n.kind) ? await jobWho(n.ref) : null;
    add(groupOf(n.kind, what), { at: n.created_at, who, site: n.business_slug, cust, what });
  }

  const audits = await query(`select entity, entity_id, action, business_slug, before_json, after_json, actor_key, actor_name, at from audit
      where date_trunc('milliseconds', at) > $2 and date_trunc('milliseconds', at) <= $3 and (entity = 'lead' or (entity = 'job' and action in ('job_delete', 'client_update')) or after_json ? 'said')
        and (business_slug = any($1::text[]) or (business_slug is null and $4)) order by at`, [sites, ...span, admin]);
  for (const r of audits) {
    if (mine(r.actor_key)) continue;
    for (const [group, what, cust] of await fromAudit(r)) add(group, { at: r.at, who: r.actor_name || 'Someone', site: r.business_slug, cust, what });
  }

  const todos = await query(`select t.id, t.site, t.text, t.due_on::text as due_on, t.lead_info, t.created_at, coalesce(p.name, t.set_by_name, 'The owners') as setter, j.customer_name, j.customer_postcode
      from todos t left join people p on p.id = t.set_by_person_id left join jobs j on j.id = t.job_id
      where t.done_at is null and date_trunc('milliseconds', t.created_at) > $1 and date_trunc('milliseconds', t.created_at) <= $2
        and (case when $3::bigint is null then t.for_owners and t.set_by_person_id is not null
                  else t.for_person_id = $3 and t.set_by_person_id is distinct from $3 end)
      order by t.created_at`, [...span, scope.personId ?? null]);
  for (const t of todos) {
    const cust = t.customer_name || t.customer_postcode ? customer(t.customer_name, t.customer_postcode) : t.lead_info ? customer(t.lead_info) : null;
    add('todos', { at: t.created_at, who: `${t.setter} set you`, site: t.site, cust, what: `"${t.text}"${t.due_on ? `, due ${t.due_on}` : ''}` });
  }

  items.sort((x, y) => x.at.localeCompare(y.at));
  const groups = GROUPS.map(([key, label]) => {
    const all = items.filter((i) => i.group === key);
    return { key, label, count: all.length, items: all.slice(-PER_GROUP).map(({ group, ...i }) => i) };
  }).filter((g) => g.count);
  const from = whenOf(since);
  const summary = groups.length
    ? `Since ${from}: ${groups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(', ')}.`
    : `Nothing new since ${from}${includeMine ? '' : ' apart from your own changes'}.`;
  return { summary, since: new Date(since).toISOString(), until: new Date(until).toISOString(), total: items.length, groups };
}

/** When this person last caught up, or null. */
export async function lastCatchUp(scope) {
  const row = await queryOne('select last_at from catchups where key = $1', [actorKey(scope)]);
  return row ? new Date(row.last_at) : null;
}

export async function markCaughtUp(scope, at) {
  await query(`insert into catchups (key, last_at) values ($1, $2) on conflict (key) do update set last_at = greatest(catchups.last_at, excluded.last_at)`, [actorKey(scope), at]);
}
