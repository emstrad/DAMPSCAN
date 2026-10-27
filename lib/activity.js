/**
 * One phone alert for each change made in the staff area.
 *
 * Every admin route is wrapped here, both where the browser reaches it (the
 * dispatcher) and where the assistant does (callRoute), so a change made
 * through ChatGPT is announced the same way and marked as such. One request
 * is one alert: a save is one request however many fields it carried, and a
 * request that already sent its own alert (a payment, a new job, a to-do) is
 * left alone, so nothing is said twice.
 *
 * The lock screen rule from notify.js holds: business, amounts, who did it
 * and the job as staff know it ("Sarah, BR6", read from the job itself).
 * Nothing from the request body is quoted except numbers, because a note, a
 * name or an address typed there may be a customer's.
 */
import { query, queryOne } from './db.js';
import { notify, requestAlerts } from './notify.js';
import { actionFrom } from './http.js';
import { actorStore } from './actor.js';
import { money, customer, jobPage, page } from './alert-words.js';
import { tellSurveyors } from './surveyor-alerts.js';
import { tickSettled } from './journey.js';


/* Routes that change nothing worth saying, or are plumbing. */
const QUIET = new Set(['mcp', 'oauth', 'push', 'me', 'due', 'summary', 'insights', 'calendar', 'todos', 'usage', 'search', 'snooze']);

const QUOTED = {
  save: (b) => (b.id ? 'edited' : 'added'), cost: 'added a cost to', uncost: 'removed a cost from', days: 'changed owners\' days on',
  unpay: 'removed a payment from', clockin: 'clocked in on', clockout: 'clocked out of', untime: 'removed clocked time from',
  hours: 'logged hours on', miles: 'logged miles on', rate: 'changed an hourly rate', message: 'marked a message sent on',
  status: 'moved', qline: 'added a quote line to', unqline: 'removed a quote line from', markup: 'changed the markup on',
  quotelink: 'made the quote link for', costsfromquote: 'copied quote costs on', fromtemplate: 'used a template on',
  invoice: 'issued the invoice for', pricefromlines: 'set the price from the lines on'
};

/** The job a request was about, as an id, or null. */
export function jobIdOf(body = {}, data = {}) {
  const id = body.id ?? body.jobId ?? (data && data.job && data.job.id);
  return id != null && /^\d+$/.test(String(id)) ? Number(id) : null;
}

/* " for Tue 20 Oct at 5pm" from a job's date and time, or nothing. */
function when(j = {}) {
  const d = j.jobDate || j.job_date;
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return '';
  const day = new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const t = String(j.jobTime || j.job_time || '').slice(0, 5);
  return ` for ${day}${t ? ' at ' + t : ''}`;
}

/** What happened, in words, or null to say nothing. `job` is how staff know the job ("Sarah, BR6"). */
export function describe(action, method, body = {}, data = {}, job = 'a job') {
  const op = body.op;
  const amount = [body.amountPence, body.costPence].map(Number).find((n) => Number.isFinite(n) && n > 0);
  if (action === 'quoted') {
    const w = QUOTED[op];
    if (!w) return null;
    let verb = typeof w === 'function' ? w(body) : w;
    if (op === 'rate') return verb;
    /* "added a £260 cost to", or the amount after when the verb has no "a". */
    let tail = '';
    if (amount && /^(added|removed) a /.test(verb)) verb = verb.replace(/ a /, ` a ${money(amount)} `);
    else if (amount) tail = ` (${money(amount)})`;
    return `${verb} ${op === 'save' && !body.id ? (job === 'a job' ? job : `a job for ${job}`) : job}${tail}`;
  }
  const theJob = job === 'a job' ? job : `the job for ${job}`;
  if (action === 'jobs') return method === 'DELETE' ? `deleted ${theJob}` : body.id ? `edited ${theJob}` : job === 'a job' ? 'added a job' : `booked ${job}${when(data.job || body)}`;
  if (action === 'clients') return `updated the client card for ${job}`;
  if (action === 'photos') return op === 'page' ? `changed the project page on ${job}` : op === 'delete' ? `removed a photo from ${job}` : op ? `changed photos on ${job}` : `added photos to ${job}`;
  if (action === 'attachment') return method === 'DELETE' ? `removed a file from ${job}` : `added a file to ${job}`;
  if (action === 'bank') return op === 'import' ? 'uploaded a bank statement' : method === 'DELETE' ? 'removed a bank statement' : op === 'feed' ? 'changed the bank feed' : 'matched bank payments';
  if (action === 'people') return 'changed the people list';
  if (action === 'rates') return 'changed rates';
  if (action === 'business') return 'changed the business details';
  if (action === 'pricebook') return 'changed the price book';
  if (action === 'contracts') return op === 'serviced' ? 'recorded a maintenance visit' : op === 'remove' ? 'ended a maintenance plan' : 'changed a maintenance plan';
  if (action === 'leads') return 'updated an enquiry';
  return null;
}

async function jobOf(id) {
  if (id == null) return null;
  try { return await queryOne('select site, customer_name, customer_postcode from jobs where id = $1', [id]); } catch { return null; }
}

async function businessOf(slug) {
  if (!slug) return null;
  try { return await queryOne('select slug, name from businesses where slug = $1', [slug]); } catch { return null; }
}

const DAMP = { damp: 'ATi & DampScan', roofing: 'Verge Roofing', ac: 'CoolRight' };

/** Wraps a route handler so a successful change is announced. Never throws for the alert. */
export function withActivity(handler, opts) {
  const inner = announce(handler, opts);
  /* A store per request, so notify() and record() know who is acting. */
  return (req, res) => actorStore.run({ scope: req.mcpScope || null }, () => inner(req, res));
}

function announce(handler, { via = null } = {}) {
  return async (req, res) => {
    const method = req.method || 'GET';
    const action = actionFrom(req.url || '');
    if (method === 'GET' || QUIET.has(action)) return handler(req, res);
    let out = '';
    const end = res.end;
    res.end = function (chunk, ...rest) { if (chunk && out.length < 200000) out += chunk; return end.call(this, chunk, ...rest); };
    const told = { sent: false };
    const result = await requestAlerts.run(told, () => handler(req, res));
    /* A surveyor's own feed hears of any change to their diary, however it came. */
    if (['jobs', 'clients', 'surveys', 'scheduling', 'quick'].includes(action) && (res.statusCode || 200) < 300) {
      try {
        let d = {}; try { d = out ? JSON.parse(out) : {}; } catch { d = {}; }
        const id = jobIdOf(req.body && typeof req.body === 'object' ? req.body : {}, d) || Number(new URL(req.url || '/', 'http://x').searchParams.get('job')) || null;
        if (id) await tellSurveyors(id);
        /* A to-do the change has overtaken (deposit in, booked, report sent) ticks itself off. */
        if (id) await tickSettled(id);
      } catch (err) { console.warn('surveyor alert failed:', err.message); }
    }
    try {
      if (told.sent || (res.statusCode || 200) >= 300) return result;
      let data = {};
      try { data = out ? JSON.parse(out) : {}; } catch { data = {}; }
      const url = new URL(req.url || '/', 'http://x');
      const body = { ...(req.body && typeof req.body === 'object' ? req.body : {}) };
      if (!body.op && url.searchParams.get('op')) body.op = url.searchParams.get('op');
      const jobId = jobIdOf(body, data);
      const job = await jobOf(jobId);
      const what = describe(action, method, body, data, job ? customer(job.customer_name, job.customer_postcode) : 'a job');
      if (!what) return result;
      const scope = req.scope || req.mcpScope || {};
      const slug = body.site || (data.job && data.job.site) || (job && job.site) || url.searchParams.get('site');
      const biz = await businessOf(slug);
      const books = url.searchParams.get('books') || body.books;
      const name = biz ? biz.name : DAMP[books] || 'Staff area';
      /* Just what happened. A named colleague is named in the title; the
         owners, and whether it came through ChatGPT, are left out. */
      const person = scope.personId != null && scope.name && scope.name !== 'Owners' ? scope.name.trim().split(/\s+/)[0] : null;
      /* Default priority: on an iPhone ntfy files low priority silently, and the owner wants to see every change. */
      /* Several changes to one job in a row (an address, then a note) are one
         alert: each is held for a minute under the job's sequence, and the
         next change replaces the waiting one with everything said so far. */
      const line = `${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
      const earlier = jobId ? (await query(
        `select message from notifications where kind = 'activity' and ref = $1 and created_at > now() - interval '2 minutes' order by id`, [jobId])).map((r) => r.message) : [];
      const lines = [...new Set([...earlier.flatMap((m) => String(m).split(/(?<=\.)\s+/)), line])];
      await notify({ business: biz ? biz.slug : null, kind: 'activity', ref: jobId || null, priority: 3,
        ...(jobId ? { sequence: `job-${jobId}`, delay: '1m' } : {}),
        tags: action === 'quoted' && /cost/.test(body.op || '') ? 'receipt' : 'pencil',
        path: job ? jobPage(job.site, jobId) : biz ? page('due.html', biz.slug) : undefined,
        title: (person ? `${name}: ${person}` : name).slice(0, 120), message: line, grouped: lines.join(' ') });
    } catch (err) {
      console.warn('activity alert failed:', err.message);
    }
    return result;
  };
}
