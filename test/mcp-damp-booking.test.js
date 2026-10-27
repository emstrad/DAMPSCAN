/**
 * A survey booked over the phone, through the assistant, the way the owners'
 * ChatGPT sent it: survey type and surveyor as said aloud, a price that is
 * not the rate card's, contact details with no web enquiry behind them. It
 * failed as "unknown error" because the surveyor "Tom" is not the key 'tom'
 * and the route's field-keyed errors were never turned into words.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'mcp-damp-secret-long-enough-xxxxxxxxx';
process.env.IP_SALT = 'mcp-damp-salt-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { callTool } = await import('../lib/routes/admin/mcp.js');
const { reasonOf } = await import('../lib/mcp/shared.js');
const { scopeFor } = await import('../lib/access.js');
const clients = (await import('../lib/routes/admin/clients.js')).default;
const { callRoute } = await import('../lib/mcp/shared.js');

const owners = async () => ({ ...(await scopeFor({ person: false, name: 'Owners' })), viaAssistant: true });
const ASKED = {
  site: 'ati-london', customer_name: 'John Nicholls', postcode: 'SW2 2JX', phone: '07814 663729', email: 'jsnicholls@gmail.com',
  note: 'Full address: 23 Josephine Avenue, London SW2 2JX. Deposit £107.50 paid.', status: 'booked', job_date: '2026-10-20',
  job_time: '17:00', price_pounds: 215, survey_type: 'localised-basement', surveyor: 'Tom'
};

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into job_rates (key, label, price_pence, surveyor_fee_pence, position) values ('localised-basement', 'Localised Basement', 25000, 11000, 5) on conflict (key) do nothing`);
});
beforeEach(async () => { await pool.query('truncate jobs, leads, todos, audit, notifications, competitor_pages, competitor_checks, events restart identity cascade'); });
after(async () => { await pool.end(); });

test('the owners\' failed ATi booking now goes through with everything said', async () => {
  const out = await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, deposit_paid: true } });
  assert.equal(out.isError, false, JSON.stringify(out.content));
  const j = (await pool.query('select * from jobs')).rows[0];
  assert.equal(j.site, 'ati-london');
  assert.equal(j.surveyor, 'tom');
  assert.equal(j.survey_type, 'localised-basement');
  assert.equal(Number(j.survey_price_pence), 21500, 'the price said replaces the rate card');
  assert.equal(String(j.job_time).slice(0, 5), '17:00');
  assert.equal(j.customer_phone, '07814 663729');
  assert.equal(j.customer_email, 'jsnicholls@gmail.com');
  assert.match(j.note, /Deposit £107.50 paid/);
  assert.ok(j.deposit_paid_at, 'deposit ticked');
  assert.equal((await pool.query("select count(*)::int as n from todos where source = 'failed'")).rows[0].n, 0);

  const cards = await callRoute(clients, await owners(), { url: '/api/admin/clients?view=all' });
  const card = cards.data.clients[0];
  assert.equal(card.phone, '07814 663729');
  assert.equal(card.email, 'jsnicholls@gmail.com');
  assert.equal(card.surveyDate, '2026-10-20');
});

test('a survey type is matched by its name, any case', async () => {
  const out = await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, survey_type: 'localised basement', surveyor: 'TOM' } });
  assert.equal(out.isError, false, JSON.stringify(out.content));
  assert.equal((await pool.query('select survey_type from jobs')).rows[0].survey_type, 'localised-basement');
});

test('an unknown survey type fails in words that list the real ones, and the to-do says so too', async () => {
  const out = await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, survey_type: 'attic' } });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /Unknown survey type "attic"\. The survey types are: Localised \(localised\)/);
  const todo = (await pool.query("select text from todos where source = 'failed'")).rows[0].text;
  assert.match(todo, /Unknown survey type/);
  assert.doesNotMatch(todo, /unknown error/);
});

test('every failure shape becomes a sentence', () => {
  assert.equal(reasonOf({ ok: false, errors: { surveyor: 'Choose who surveyed it.', surveyType: 'Unknown.' } }), 'Choose who surveyed it. Unknown.');
  assert.equal(reasonOf({ ok: false, error: 'forbidden' }), 'You do not hold that business.');
  assert.equal(reasonOf({ ok: false, error: 'jobs_failed' }), 'The server hit an error saving it. Try again in a moment.');
  assert.equal(reasonOf(null), 'The server did not say why.');
});

test('update_client sets a phone and email on an ATi card, which then shows them over the enquiry\'s', async () => {
  const lead = (await pool.query(`insert into leads (session_id, site, stage, first_name, phone, email, postcode) values (gen_random_uuid(), 'ati-london', 'complete', 'Jo', '07000 000000', 'old@example.com', 'SW2 2JX') returning id`)).rows[0].id;
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, phone: undefined, email: undefined, lead_id: Number(lead) } });
  const id = Number((await pool.query('select id from jobs')).rows[0].id);
  const before = (await callRoute(clients, await owners(), { url: '/api/admin/clients?view=all' })).data.clients[0];
  assert.equal(before.phone, '07000 000000', 'the enquiry fills in behind');

  const out = await callTool(await owners(), { name: 'update_client', arguments: { id, phone: '07814 663729', email: 'jsnicholls@gmail.com' } });
  assert.equal(out.isError, false, JSON.stringify(out.content));
  const card = (await callRoute(clients, await owners(), { url: '/api/admin/clients?view=all' })).data.clients[0];
  assert.equal(card.phone, '07814 663729');
  assert.equal(card.email, 'jsnicholls@gmail.com');
  assert.ok((await pool.query('select deposit_paid_at from jobs')).rows[0].deposit_paid_at === null, 'no deposit unless said');
});

test('the client card dialog saves a phone and email, checked like the quoted trades', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, phone: undefined, email: undefined } });
  const id = Number((await pool.query('select id from jobs')).rows[0].id);
  const bad = await callRoute(clients, await owners(), { method: 'POST', url: '/api/admin/clients', body: { id, email: 'not-an-email' } });
  assert.equal(bad.status, 400);
  const good = await callRoute(clients, await owners(), { method: 'POST', url: '/api/admin/clients', body: { id, phone: '020 7946 0000', email: 'a@b.co' } });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.equal(good.data.client.phone, '020 7946 0000');
  assert.equal(good.data.client.email, 'a@b.co');
});

test('update_client sets a full address and postcode, and the card shows the address', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const j = (await pool.query('select id from jobs')).rows[0];
  const r = await callTool(await owners(), { name: 'update_client', arguments: { id: 'Nicholls', address: '12 High Street, West Malling', postcode: 'me19 6qh' } });
  assert.equal(r.isError, false, JSON.stringify(r.content));
  const { rows: [row] } = await pool.query('select customer_address, customer_postcode from jobs where id = $1', [j.id]);
  assert.deepEqual(row, { customer_address: '12 High Street, West Malling', customer_postcode: 'ME19 6QH' });
  const card = (await callRoute(clients, await owners(), { url: '/api/admin/clients?view=all' })).data.clients[0];
  assert.equal(card.fullAddress, '12 High Street, West Malling');
});

test('a survey handed to Ben with no login of his own makes him the surveyor, on the owners\' list', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const r = await callTool(await owners(), { name: 'handover_job', arguments: { id: 'Nicholls', to: 'Ben', note: 'Surveyor changed from Tom to Ben.' } });
  assert.equal(r.isError, false, JSON.stringify(r.content));
  assert.equal((await pool.query('select surveyor from jobs')).rows[0].surveyor, 'ben');
  const todo = (await pool.query('select text, for_owners from todos')).rows[0];
  assert.match(todo.text, /^For Ben:/);
  assert.equal(todo.for_owners, true);
  const t = await callTool(await owners(), { name: 'add_todo', arguments: { text: 'Ring Nicholls', for: 'Tom' } });
  assert.equal(t.isError, false, JSON.stringify(t.content));
});

test('still_to_pay counts the surveys not yet paid in full', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, job_date: '2026-10-01' } });
  await pool.query(`update jobs set status = 'completed'`);
  const r = await callTool(await owners(), { name: 'still_to_pay', arguments: {} });
  assert.equal(r.isError, false, JSON.stringify(r.content));
  assert.equal(r.structuredContent.count, 1);
  assert.equal(r.structuredContent.list[0].business, 'ATi');
});

test('owner_briefing and match_email answer for the owners', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const b = await callTool(await owners(), { name: 'owner_briefing', arguments: { weeks_ago: 0 } });
  assert.equal(b.isError, false, JSON.stringify(b.content));
  assert.ok(b.structuredContent.businesses.some((x) => x.business === 'ATi'));
  const m = await callTool(await owners(), { name: 'match_email', arguments: { from_email: 'JSNicholls@gmail.com', text: 'Can we move the survey?' } });
  assert.equal(m.isError, false, JSON.stringify(m.content));
  assert.equal(m.structuredContent.jobs[0].customer, 'John Nicholls');
  const byPhone = await callTool(await owners(), { name: 'match_email', arguments: { from_email: 'other@example.com', text: 'ring me on 07814 663729' } });
  assert.equal(byPhone.structuredContent.jobs.length, 1);
});

test('a phone alert button ticks paid in full for its job only, and a forged one does nothing', async () => {
  const { quickButtons } = await import('../lib/quick-action.js');
  const quick = (await import('../lib/routes/admin/quick.js')).default;
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const id = Number((await pool.query('select id from jobs')).rows[0].id);
  const [paid, deposit, open] = quickButtons(id, ['paid', 'deposit'], 'https://dampscan.co.uk/staff/jobs.html');
  assert.equal(paid.label, 'Paid in full');
  assert.equal(deposit.label, 'Deposit paid');
  assert.equal(open.action, 'view');
  const hit = async (url) => { const u = new URL(url); let body = ''; const res = { statusCode: 200, setHeader() {}, getHeader() {}, write(c) { body += c; }, end(c) { if (c) body += c; } };
    await quick({ method: 'POST', url: u.pathname + u.search, headers: {} }, res); return res.statusCode; };
  assert.equal(await hit(paid.url.replace(/sig=../, 'sig=00')), 403);
  assert.equal(await hit(paid.url.replace(`job=${id}`, `job=${id + 1}`)), 403);
  assert.equal((await pool.query('select paid_at from jobs')).rows[0].paid_at, null);
  assert.equal(await hit(paid.url), 200);
  assert.notEqual((await pool.query('select paid_at from jobs')).rows[0].paid_at, null);
});

test('a paid job from a Google Ads click is in the brand\'s feed, behind its key, with no customer details', async () => {
  const { feedKey } = await import('../lib/ads-conversions.js');
  const conversions = (await import('../lib/routes/admin/conversions.js')).default;
  const lead = (await pool.query(`insert into leads (session_id, site, stage, first_name, phone, email, postcode, utm) values (gen_random_uuid(), 'ati-london', 'complete', 'Jo', '07000 000000', 'jo@example.com', 'SW2 2JX', '{"gclid":"abc123"}') returning id`)).rows[0].id;
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, lead_id: Number(lead) } });
  await pool.query(`update jobs set paid_at = now()`);
  const hit = async (qs) => { let body = ''; const res = { statusCode: 200, setHeader() {}, getHeader() {}, write(c) { body += c; }, end(c) { if (c) body += c; } };
    await conversions({ method: 'GET', url: '/api/admin/conversions?' + qs, headers: {} }, res); return { status: res.statusCode, body }; };
  assert.equal((await hit('site=ati-london&key=wrong')).status, 404);
  assert.equal((await hit(`site=dampscan&key=${feedKey('ati-london')}`)).status, 404, 'another brand\'s key');
  const ok = await hit(`site=ati-london&key=${feedKey('ati-london')}`);
  assert.equal(ok.status, 200);
  assert.match(ok.body, /^Parameters:TimeZone=Europe\/London\nGoogle Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\nabc123,Paid job,\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,215\.00,GBP\n$/);
  assert.ok(!/Nicholls|Jo|SW2/.test(ok.body));
});

test('the competitor watch remembers pages and names the new ones from the second look', async () => {
  const { checkCompetitor } = await import('../lib/competitors.js');
  const real = globalThis.fetch;
  let pages = ['https://rival.example/', 'https://rival.example/damp-proofing/maidstone/'];
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('ntfy') || (init && init.method === 'POST')) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; }
    if (String(url).endsWith('sitemap.xml')) return { ok: true, status: 200, text: async () => `<urlset>${pages.map((p) => `<url><loc>${p}</loc></url>`).join('')}</urlset>` };
    return { ok: true, status: 200, text: async () => '<html><title>Damp proofing Sevenoaks</title></html>' };
  };
  process.env.NTFY_TOPIC = 'test-topic';
  try {
    const c = { name: 'Rival', host: 'rival.example', business: 'dampscan' };
    assert.equal((await checkCompetitor(c)).added, 0, 'the first look is the baseline');
    pages = [...pages, 'https://rival.example/damp-proofing/sevenoaks/', 'https://elsewhere.example/x'];
    const second = await checkCompetitor(c);
    assert.equal(second.added, 1);
    assert.equal((await pool.query(`select title from competitor_pages where url like '%sevenoaks%'`)).rows[0].title, 'Damp proofing Sevenoaks');
    const note = (await pool.query(`select title, message from notifications where kind = 'competitor'`)).rows[0];
    assert.match(note.title, /Rival: 1 new page/);
    assert.match(note.message, /damp proofing sevenoaks/i);
  } finally { globalThis.fetch = real; delete process.env.NTFY_TOPIC; }
});

test('a survey whose day has passed with nothing paid is on the paid-in-full list, though still booked', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, job_date: '2026-10-01' } });
  assert.equal((await pool.query('select status from jobs')).rows[0].status, 'booked');
  const r = await callTool(await owners(), { name: 'still_to_pay', arguments: {} });
  assert.equal(r.structuredContent.count, 1, JSON.stringify(r.structuredContent));
});

test('a postcode being corrected still finds the job by the name', async () => {
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const r = await callTool(await owners(), { name: 'update_client', arguments: { id: 'Nicholls ME14 2RP', postcode: 'ME14 2RP' } });
  assert.equal(r.isError, false, JSON.stringify(r.content));
  assert.equal((await pool.query('select customer_postcode from jobs')).rows[0].customer_postcode, 'ME14 2RP');
});

test('job totals count damp surveys done apart from those booked ahead, and records celebrate them', async () => {
  const { jobTotals, records } = await import('../lib/job-totals.js');
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, job_date: '2026-09-01' } });
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, customer_name: 'Ahead Person', job_date: '2099-01-01' } });
  await pool.query(`update jobs set paid_at = now() where customer_name = 'John Nicholls'`);
  const t = await jobTotals(['ati-london', 'roofing'], `'-infinity'::timestamptz`);
  assert.equal(t.done, 1);
  assert.equal(t.bookedAhead, 1);
  assert.equal(t.paid, 1);
  assert.equal(t.unpaid, 0);
  assert.equal(t.surveyValuePence, 21500);
  const r = await records(['ati-london'], true);
  assert.equal(r.surveys, 1);
  assert.equal(r.milestones[0].survey, 1);
  assert.equal(r.nextMilestone.at, 10);
  assert.equal(r.surveyors[0].name, 'Tom');
  assert.equal((await records(['ati-london'], false)).valuePence, undefined, 'no money without managing');
  assert.equal(await records(['roofing'], true), null);
});

test('a to-do added against a job shows as a count on the board and in the pop-up', async () => {
  const todosRoute = (await import('../lib/routes/admin/todos.js')).default;
  const surveysRoute = (await import('../lib/routes/admin/surveys.js')).default;
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  const id = Number((await pool.query('select id from jobs')).rows[0].id);
  const add = await callRoute(todosRoute, await owners(), { method: 'POST', url: '/api/admin/todos', body: { op: 'add', text: 'Chase the agent for keys', jobId: id } });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  assert.equal(Number((await pool.query('select job_id from todos')).rows[0].job_id), id);
  const board = (await callRoute(surveysRoute, await owners(), { url: '/api/admin/surveys?area=damp' })).data;
  const card = JSON.stringify(board).match(/"todoCount":(\d+)/);
  assert.equal(card && card[1], '1');
});

test('all time: earned, and what every enquiry and every visitor would have made at the average job', async () => {
  const { allTime } = await import('../lib/potential.js');
  await callTool(await owners(), { name: 'create_job', arguments: ASKED });
  await pool.query(`update jobs set paid_at = now()`);
  await pool.query(`insert into leads (session_id, site, stage, first_name, email, postcode) values (gen_random_uuid(), 'ati-london', 'complete', 'Lost', 'l@example.com', 'SW2 2JX')`);
  for (let i = 0; i < 3; i++) await pool.query(`insert into events (session_id, site, type) values (gen_random_uuid(), 'ati-london', 'page_view')`);
  const a = await allTime(['ati-london']);
  assert.equal(a.earnedPence, 21500);
  assert.equal(a.averageJobPence, 21500);
  assert.equal(a.enquiries, 2);
  assert.equal(a.everyEnquiryPence, 43000);
  assert.equal(a.visitors, 3);
  assert.equal(a.everyVisitorPence, 64500);
  assert.equal(a.bookingRate, 50);
  /* The same person enquiring online, then booked by phone with no link, is
     not a missed enquiry. */
  await pool.query(`insert into leads (session_id, site, stage, first_name, email, postcode) values (gen_random_uuid(), 'ati-london', 'complete', 'John', 'JSNICHOLLS@gmail.com', 'SW2 2JX')`);
  assert.equal((await allTime(['ati-london'])).enquiries, 2, 'matched by email');
  /* A second survey with only its deposit in adds that half, and a matched
     bank payment on the paid one is not counted twice. */
  await callTool(await owners(), { name: 'create_job', arguments: { ...ASKED, customer_name: 'Dep Only' } });
  await pool.query(`update jobs set deposit_paid_at = now() where customer_name = 'Dep Only'`);
  await pool.query(`insert into job_payments (job_id, amount_pence, paid_on, label) select id, 21500, current_date, 'balance' from jobs where customer_name = 'John Nicholls'`);
  assert.equal((await allTime(['ati-london'])).earnedPence, 21500 + 10750);
});

test('reports owed, the customer story, the same-person link and the Friday money check', async () => {
  const { reportsOwed } = await import('../lib/surveys.js');
  const { timelineFor } = await import('../lib/timeline.js');
  const { matchesFor, linkLead } = await import('../lib/duplicates.js');
  const { alertFridayMoney } = await import('../lib/friday-money.js');
  const scope = await owners();
  await callTool(scope, { name: 'create_job', arguments: { ...ASKED, job_date: '2026-09-01' } });
  const id = Number((await pool.query('select id from jobs')).rows[0].id);
  assert.equal((await reportsOwed(['ati-london'])).length, 1);
  await pool.query('update jobs set deposit_paid_at = now() where id = $1', [id]);
  const story = await timelineFor(scope, id);
  assert.ok(story.some((e) => e.what === 'Job started') && story.some((e) => e.what === 'Deposit paid'));
  const lead = Number((await pool.query(`insert into leads (session_id, site, stage, first_name, email, postcode) values (gen_random_uuid(), 'ati-london', 'complete', 'John', 'jsnicholls@gmail.com', 'SW2 2JX') returning id`)).rows[0].id);
  assert.equal((await matchesFor(scope, id))[0].leadId, lead);
  assert.equal((await linkLead(scope, id, 999999)).error !== undefined, true, 'only a real match links');
  assert.equal((await linkLead(scope, id, lead)).ok, true);
  assert.equal(Number((await pool.query('select lead_id from jobs where id = $1', [id])).rows[0].lead_id), lead);
  assert.equal((await alertFridayMoney(new Date('2026-10-22T08:00:00Z'))).skipped, 'not Friday');
  const fri = await alertFridayMoney(new Date('2026-10-23T08:00:00Z'));
  assert.equal(fri.sent, 1);
  assert.equal((await alertFridayMoney(new Date('2026-10-23T09:00:00Z'))).skipped, 'sent', 'once a Friday');
  const note = (await pool.query(`select title, message from notifications where kind = 'friday_money'`)).rows[0];
  assert.match(note.title, /1 unpaid, £107\.50/);
  assert.ok(!/Nicholls/.test(note.message));
});

test('free times come only from set hours, two days on, and never next to a booked survey', async () => {
  const { addHours, freeSlots, addUsual } = await import('../lib/availability.js');
  await pool.query('truncate surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags');
  const scope = await owners();
  const today = '2026-11-02';
  assert.deepEqual(await freeSlots({ today }), [], 'no hours, nothing offered');
  await addHours(scope, 'tom', '2026-11-03', '09:00', '17:00');
  assert.deepEqual(await freeSlots({ today }), [], 'inside two days is never offered');
  await addHours(scope, 'tom', '2026-11-07', '09:00', '13:00');
  assert.deepEqual((await freeSlots({ today })).map((s) => s.time), ['09:00', '10:00', '11:00', '12:00']);
  await callTool(scope, { name: 'create_job', arguments: { ...ASKED, job_date: '2026-11-07', job_time: '10:00' } });
  assert.deepEqual((await freeSlots({ today })).map((s) => s.time), ['12:00'], 'an hour either side of a booked survey is travel');
  await pool.query(`insert into leads (session_id, site, stage, first_name, email, postcode, pencil_date, pencil_time, pencil_surveyor, pencil_until) values (gen_random_uuid(), 'ati-london', 'complete', 'Held', 'h@example.com', 'SW2 2JX', '2026-11-07', '12:00', 'tom', now() + interval '48 hours')`);
  assert.deepEqual(await freeSlots({ today }), [], 'a time an enquiry is holding is taken');
  await addHours(scope, 'ronnie', '2026-11-08', '09:00', '10:00');
  await callTool(scope, { name: 'create_job', arguments: { ...ASKED, customer_name: 'No Time', job_date: '2026-11-08', job_time: undefined, surveyor: 'Ronnie' } });
  assert.deepEqual(await freeSlots({ today }), [], "a booked survey with no time blocks that surveyor's day");
  const usual = await addUsual(scope, 'ben', '2026-11-09', 1);
  assert.equal(usual.added, 7);
});
