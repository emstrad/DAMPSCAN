/**
 * The Calendar's working day: the "Action needed" list (lib/work.js), the
 * calendar route's ?view=work, and the assistant's what_needs_doing, which
 * must all be the same list, scoped, with money only for managers.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'work-test-secret-long-enough-xxxxxxx';
process.env.IP_SALT = 'work-test-salt';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const login = (await import('../lib/routes/auth/login.js')).default;
const quoted = (await import('../lib/routes/admin/quoted.js')).default;
const clients = (await import('../lib/routes/admin/clients.js')).default;
const calendar = (await import('../lib/routes/admin/calendar.js')).default;
const { TOOLS } = await import('../lib/mcp/tools.js');
const { scopeFor } = await import('../lib/access.js');
const { actionsFor, flagsByJob, GROUPS } = await import('../lib/work.js');

const P = (pounds) => Math.round(pounds * 100);
function makeReq({ method = 'POST', url = '/api/admin/quoted', body, headers = {} } = {}) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.7', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.7' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function person(name, code, grants, isAdmin = false, level = 'work') {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  return Number(rows[0].id);
}
async function signIn(code) {
  const res = await call(login, { url: '/api/auth/login', body: { code } });
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const post = (cookie, body) => call(quoted, { body, headers: { cookie } });
let D;
const work = async (cookie, extra = '') => (await call(calendar, { method: 'GET', url: `/api/admin/calendar?view=work&from=${D.from}&to=${D.to}${extra}`, headers: { cookie } })).json();
const group = (w, key) => (w.groups.find((g) => g.key === key) || { items: [] }).items;
async function damp(fields) {
  const f = { status: 'booked', date: D.today, paid: false, deposit: false, sent: false, agent: false, ...fields };
  return Number((await pool.query(
    `insert into jobs (site, customer_name, customer_postcode, customer_phone, status, job_date, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b,
                       paid_at, deposit_paid_at, survey_sent_at, awaiting_agent)
     values ('dampscan', $1, 'ME14 1AA', '07700 900123', $2, $3::date, 30000, null, 0, 0, '', '', '',
             case when $4 then now() end, case when $5 then now() end, case when $6 then now() end, $7) returning id`,
    [f.name, f.status, f.date, f.paid, f.deposit, f.sent, f.agent])).rows[0].id);
}

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_costs, job_owner_days, job_payments, payouts, notifications, todos restart identity cascade');
  D = (await pool.query(`select d::text as today, (d + 1)::text as tomorrow, (d - 3)::text as past, (d - 20)::text as old, (d - 30)::text as "from", (d + 30)::text as "to"
                           from (select (now() at time zone 'Europe/London')::date as d) x`)).rows[0];
});
after(async () => { await pool.end(); });

async function world() {
  const scott = await person('Scott', 'scott-code', ['dampscan', 'ati-london', 'roofing', 'ac'], true, 'manage');
  await person('Steve', 'steve-code', ['roofing']);
  const boss = await signIn('scott-code');
  await pool.query(`insert into leads (site, stage, first_name, email, phone, postcode, session_id, issues) values ('dampscan', 'complete', 'Priya', 'p@x.com', '07700 900111', 'ME14 1AA', gen_random_uuid(), array['Damp'])`);
  const j = async (body) => (await post(boss, body)).json().job;
  const tomorrow = await j({ op: 'save', site: 'roofing', customerName: 'Tom Tomorrow', customerPostcode: 'BR6 0AA', invoiceNetPence: P(1000), status: 'booked', jobDate: D.tomorrow });
  const unpaid = await j({ op: 'save', site: 'roofing', customerName: 'Una Unpaid', invoiceNetPence: P(800), status: 'completed', jobDate: D.past });
  const late = await j({ op: 'save', site: 'roofing', customerName: 'Larry Late', invoiceNetPence: P(600), status: 'completed', jobDate: D.old });
  const accepted = await j({ op: 'save', site: 'roofing', customerName: 'Ann Accepted', invoiceNetPence: P(2000), status: 'quoted' });
  await pool.query('update jobs set quote_accepted_at = now() where id = $1', [accepted.id]);
  const report = await damp({ name: 'Rita Report', status: 'completed', date: D.past, paid: true });
  /* Owed from the survey or the payment, whichever was later: paid four days ago. */
  await pool.query(`update jobs set paid_at = now() - interval '4 days' where id = $1`, [report]);
  const agent = await damp({ name: 'Andy Agent', date: D.tomorrow, agent: true });
  const deposit = await damp({ name: 'Dee Deposit', date: D.tomorrow });
  await pool.query(`insert into todos (text, site, set_by_name, source, due_on) values ('Ring the skip firm', 'roofing', 'Scott', 'manual', $1::date - 1)`, [D.today]);
  return { scott, boss, steve: await signIn('steve-code'), tomorrow, unpaid, late, accepted, report, agent, deposit };
}

test('the owner sees every action, grouped in order, with badges on the calendar', async () => {
  const w = await world();
  const d = await work(w.boss);
  assert.equal(d.work.money, true);
  const keys = d.work.groups.map((g) => g.key);
  assert.deepEqual(keys, GROUPS.map((g) => g[0]).filter((k) => keys.includes(k)), 'groups keep the set order');
  assert.deepEqual(group(d.work, 'enquiries').map((i) => [i.firstName, i.phone]), [['Priya', '07700 900111']]);
  const msgs = group(d.work, 'messages');
  assert.deepEqual([msgs[0].jobId, msgs[0].message.kind, msgs[0].firstName, msgs[0].postcode], [w.tomorrow.id, 'reminder', 'Tom', 'BR6 0AA'], 'tomorrow\'s reminder leads');
  assert.deepEqual(msgs.slice(1).map((i) => i.message.kind), ['rating', 'rating'], 'finished work asks how it went');
  assert.deepEqual(group(d.work, 'nodate').map((i) => [i.jobId, i.date]), [[w.accepted.id, null]]);
  assert.deepEqual(group(d.work, 'agent').map((i) => i.jobId), [w.agent]);
  assert.deepEqual(group(d.work, 'reports').map((i) => [i.jobId, i.overdue]), [[w.report, true]]);
  assert.deepEqual(group(d.work, 'deposits').filter((i) => !i.quoted).map((i) => i.jobId), [w.deposit], 'the agent wait is its own group, not a deposit too');
  assert.deepEqual(group(d.work, 'payments').map((i) => [i.jobId, i.owedPence]), [[w.unpaid.id, P(800)]]);
  assert.deepEqual(group(d.work, 'invoices').map((i) => [i.jobId, i.overdue]), [[w.late.id, true]], 'unpaid past the cut-off is an overdue invoice');
  assert.deepEqual(group(d.work, 'todos').map((i) => [i.what, i.overdue]), [['Ring the skip firm', true]]);
  assert.equal(d.work.total, d.work.groups.reduce((s, g) => s + g.count, 0));
  const ev = d.events.find((e) => e.id === w.unpaid.id);
  assert.deepEqual(ev.flags, ['messages', 'payments', 'finish'], 'a finished roof also has its finishing steps to do');
  assert.equal(d.events.find((e) => e.id === w.agent).awaitingAgent, true);
  assert.deepEqual(d.events.find((e) => e.id === w.deposit).flags, ['deposits']);
  assert.ok(Array.isArray(d.todayEvents));
  assert.equal(group(d.work, 'enquiries')[0].whatsapp, 'https://wa.me/447700900111');
});

test('a worker sees the work on their own jobs only, and none of its money', async () => {
  const w = await world();
  /* Today lists a surveyor's own jobs only (lib/worker-view.js): give him the roof. */
  await pool.query("update jobs set assigned_person_id = (select id from people where name = 'Steve') where id = $1", [w.tomorrow.id]);
  const d = await work(w.steve);
  assert.equal(d.work.money, false);
  for (const k of ['deposits', 'payments', 'invoices', 'budget']) assert.deepEqual(group(d.work, k), [], `${k} is money`);
  for (const k of ['enquiries', 'agent', 'reports']) assert.deepEqual(group(d.work, k), [], `${k} is not his business`);
  assert.equal(group(d.work, 'messages')[0].jobId, w.tomorrow.id);
  assert.ok(d.work.groups.every((g) => g.items.every((i) => i.owedPence === undefined && ['roofing', null].includes(i.site))));
  assert.ok(d.events.every((e) => e.site === 'roofing'));
  assert.ok(d.events.every((e) => !(e.flags || []).includes('payments')));
  const asked = await work(w.steve, '&area=damp');
  assert.equal(asked.work.total, 0, 'an area outside the scope yields nothing');
  assert.deepEqual(asked.events, []);
});

test('an area filter narrows the list, and plain calendar requests are unchanged', async () => {
  const w = await world();
  const d = await work(w.boss, '&area=damp');
  assert.ok(d.work.groups.every((g) => g.items.every((i) => i.site === null || ['dampscan', 'ati-london'].includes(i.site))));
  assert.deepEqual(group(d.work, 'todos'), [], 'a roofing to-do is not on the damp list');
  const plain = (await call(calendar, { method: 'GET', url: `/api/admin/calendar?from=${D.from}&to=${D.to}`, headers: { cookie: w.boss } })).json();
  assert.equal(plain.work, undefined);
  assert.equal(plain.events[0].flags, undefined);
});

test('acting on an item takes it off the list', async () => {
  const w = await world();
  const tick = (body) => call(clients, { body, headers: { cookie: w.boss } });
  assert.equal((await tick({ id: w.report, surveySent: true })).statusCode, 200);
  assert.equal((await tick({ id: w.deposit, depositPaid: true })).statusCode, 200);
  assert.equal((await tick({ id: w.agent, jobTime: '10:00' })).statusCode, 200, 'a time clears the agent wait');
  await post(w.boss, { op: 'message', id: w.tomorrow.id, kind: 'reminder', channel: 'whatsapp' });
  await post(w.boss, { op: 'status', id: w.accepted.id, status: 'booked', jobDate: D.tomorrow });
  const d = await work(w.boss);
  for (const k of ['reports', 'nodate', 'agent']) assert.deepEqual(group(d.work, k), [], k);
  assert.ok(!group(d.work, 'messages').some((i) => i.jobId === w.tomorrow.id), 'the reminder went');
  assert.deepEqual(group(d.work, 'deposits').filter((i) => !i.quoted).map((i) => i.jobId), [w.agent], 'once the agent confirms, the deposit is next');
  assert.equal(d.events.find((e) => e.id === w.accepted.id).date, D.tomorrow, 'the accepted quote is now on the calendar');
});

test('what_needs_doing is the same list the calendar shows', async () => {
  const w = await world();
  const scope = await scopeFor({ person: true, sub: w.scott });
  const r = await TOOLS.find((t) => t.name === 'what_needs_doing').run(scope, {});
  assert.equal(r.status, 200);
  const page = (await work(w.boss)).work;
  assert.deepEqual(r.data.actionNeeded.map((g) => [g.group, g.count]), page.groups.map((g) => [g.key, g.count]));
  assert.equal(r.data.total, page.total);
  const roofing = await TOOLS.find((t) => t.name === 'what_needs_doing').run(scope, { area: 'roofing' });
  assert.ok(roofing.data.actionNeeded.every((g) => g.items.every((i) => ['roofing', null].includes(i.site))));
  const flags = flagsByJob(await actionsFor(scope, ['roofing']));
  assert.deepEqual(flags.get(w.late.id), ['messages', 'invoices', 'finish'], 'a job carries every group it sits in');
});

test('Verge and CoolRight deposits: accepted or booked work with nothing received', async () => {
  const w = await world();
  const d = await work(w.boss);
  const q = group(d.work, 'deposits').filter((i) => i.quoted).map((i) => i.jobId).sort((a, b) => a - b);
  assert.deepEqual(q, [w.tomorrow.id, w.accepted.id].sort((a, b) => a - b));
  await post(w.boss, { op: 'payment', id: w.tomorrow.id, amountPence: P(300), label: 'deposit', paidOn: D.today });
  const after = await work(w.boss);
  assert.ok(!group(after.work, 'deposits').some((i) => i.jobId === w.tomorrow.id), 'a payment clears it');
  assert.deepEqual(group(await work(w.steve).then((x) => x.work), 'deposits'), [], 'deposits are money');
});

test('date_set: a defaulted date is "not booked in yet", a chosen one is a real day', async () => {
  const w = await world();
  const set = async (id) => (await pool.query('select date_set from jobs where id = $1', [id])).rows[0].date_set;
  const undated = (await post(w.boss, { op: 'save', site: 'ac', customerName: 'Nora Nodate', invoiceNetPence: P(500), status: 'booked' })).json().job;
  assert.equal(await set(undated.id), false, 'no date given');
  assert.equal(await set(w.tomorrow.id), true, 'a date given on create');
  const today = (await post(w.boss, { op: 'save', site: 'ac', customerName: 'Tia Today', invoiceNetPence: P(500), status: 'booked', jobDate: D.today })).json().job;
  assert.equal(await set(today.id), true, 'today, typed in, is a real date');
  let d = await work(w.boss);
  assert.deepEqual(d.unbooked.map((e) => e.id).sort((a, b) => a - b), [w.accepted.id, undated.id].sort((a, b) => a - b));
  assert.equal(d.events.find((e) => e.id === undated.id).dateSet, false);
  /* Re-saving the form with the date it showed does not count as choosing it. */
  const j = (await post(w.boss, { op: 'save', id: undated.id, site: 'ac', customerName: 'Nora Nodate', invoiceNetPence: P(500), status: 'booked', jobDate: D.today })).json().job;
  assert.equal(j.id, undated.id);
  assert.equal(await set(undated.id), false);
  await post(w.boss, { op: 'status', id: undated.id, status: 'booked', jobDate: D.today });
  assert.equal(await set(undated.id), true, 'a move, even to the same day, sets it');
  const dampUndated = await damp({ name: 'Una Undated' });
  assert.equal(await set(dampUndated), false);
  await call(clients, { body: { id: dampUndated, jobTime: '09:30' }, headers: { cookie: w.boss } });
  assert.equal(await set(dampUndated), true, 'a time means the day was agreed');
  d = await work(w.boss);
  assert.ok(!d.unbooked.some((e) => e.id === undated.id || e.id === dampUndated));
});

test('one job for the pop-up, with money only for a manager', async () => {
  const w = await world();
  const get = (cookie, id) => call(calendar, { method: 'GET', url: `/api/admin/calendar?view=job&id=${id}`, headers: { cookie } });
  const boss = (await get(w.boss, w.deposit)).json().job;
  assert.deepEqual([boss.customerName, boss.quoted, boss.depositPaid, boss.money.depositPence], ['Dee Deposit', false, false, 15000]);
  const steve = (await get(w.steve, w.tomorrow.id)).json().job;
  assert.equal(steve.money, null);
  assert.equal((await get(w.steve, w.deposit)).statusCode, 404, 'not his business');
});

/* The live bug: a survey booked by phone or by the assistant has no enquiry,
   so its address is only on the job, and the pop-up showed none (no way to
   navigate). An enquiry's photos and notes must come through as well. */
test('the pop-up carries the job address, the enquiry files and notes', async () => {
  const w = await world();
  const get = async (id) => (await call(calendar, { method: 'GET', url: `/api/admin/calendar?view=job&id=${id}`, headers: { cookie: w.boss } })).json().job;
  const phoned = await damp({ name: 'Jack Phoned' });
  await pool.query(`update jobs set customer_address = '12 High Street, Maidstone' where id = $1`, [phoned]);
  let j = await get(phoned);
  assert.deepEqual(j.address, ['12 High Street, Maidstone', 'ME14 1AA']);
  assert.equal(j.phone, '07700 900123');
  assert.deepEqual([j.lead, j.files, j.photos], [null, [], []]);
  const lead = (await pool.query(
    `insert into leads (stage, first_name, email, postcode, phone, session_id, address_line1, town, notes, issues, files, site)
     values ('complete', 'Lena', 'lena@example.com', 'ME14 1AA', '07700 900456', gen_random_uuid(), '3 Mill Lane', 'Maidstone', 'Side gate is locked', '{Rising damp}',
             '{leads/2026-10-01/abc-wall.jpg,leads/2026-10-01/def-report.pdf}', 'dampscan') returning id`)).rows[0].id;
  const withLead = await damp({ name: 'Lena Lead' });
  await pool.query('update jobs set lead_id = $1 where id = $2', [lead, withLead]);
  j = await get(withLead);
  assert.deepEqual(j.address, ['3 Mill Lane', 'Maidstone', 'ME14 1AA']);
  assert.deepEqual(j.lead, { notes: 'Side gate is locked', issues: ['Rising damp'] });
  assert.deepEqual(j.files.map((f) => [f.name, f.image]), [['abc-wall.jpg', true], ['def-report.pdf', false]]);
});
