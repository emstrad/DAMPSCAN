/**
 * Every way of booking carries the same things across, and the joins between
 * Scheduling, the job pop-up, repeat forms and ChatGPT hold.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'pencil-secret-long-enough-xxxxxxxxxxx';
process.env.IP_SALT = 'pencil-salt-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const { scopeFor } = await import('../lib/access.js');
const { callRoute } = await import('../lib/mcp/shared.js');
const route = (await import('../lib/routes/admin/scheduling.js')).default;
const owners = () => scopeFor({ person: false, name: 'Owners' });
const post = async (body) => callRoute(route, await owners(), { method: 'POST', url: '/api/admin/scheduling', body });
const DATE = '2030-06-01';

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into job_rates (key, label, price_pence, surveyor_fee_pence, position) values ('localised', 'Localised', 25000, 11000, 1) on conflict (key) do nothing`);
});
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours, mail_seen, estate_agents restart identity cascade');
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ('tom', $1, '09:00', '17:00')`, [DATE]);
});
after(async () => { await pool.end(); });


const lead = async (name, email, extra = {}) => Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id, survey_choice, created_at, sched_stage)
  values ('dampscan', 'complete', $1, 'ME19 6AB', $2, gen_random_uuid(), $3, coalesce($4::timestamptz, now()), $5) returning id`,
  [name, email, extra.choice ? JSON.stringify(extra.choice) : null, extra.created || null, extra.stage || null])).rows[0].id);
const jobOf = async (leadId) => (await pool.query('select * from jobs where lead_id = $1', [leadId])).rows[0];

test('booking an enquiry prices the extras chosen online', async () => {
  const kim = await lead('Kim', 'kim@example.com', { choice: { service: 'damp', name: 'Damp survey', price: 215, key: 'localised', addOns: [{ name: 'Camera check', price: 85 }] } });
  const r = await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(Number((await jobOf(kim)).survey_price_pence), 30000);
});

test('the booking form\'s ticked extras set the price and go on the job for the surveyor', async () => {
  const lana = await lead('Lana', 'lana@example.com', { choice: { service: 'damp', name: 'Damp survey', price: 215, key: 'localised', addOns: [{ key: 'camera', name: 'Underfloor camera check', price: 85 }] } });
  const r = await post({ op: 'book', kind: 'lead', id: lana, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', extras: ['camera', 'cavity', 'nonsense'], force: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const job = await jobOf(lana);
  const rate = Number((await pool.query("select price_pence from job_rates where key = 'localised'")).rows[0].price_pence);
  assert.equal(Number(job.survey_price_pence), rate + 8500 + 9500, 'the rate card survey plus each ticked extra, unknown keys ignored');
  assert.match(job.note, /Extras: underfloor camera check, low-level cavity bridging check/);
  const typed = await lead('Tess', 'tess@example.com');
  await post({ op: 'book', kind: 'lead', id: typed, date: DATE, time: '13:00', surveyor: 'tom', surveyType: 'localised', extras: [], pricePounds: 395, force: true });
  assert.equal(Number((await jobOf(typed)).survey_price_pence), 39500, 'a typed price wins');
});

test('unbook clears an old hold, and not going ahead can be undone', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  const job = Number((await jobOf(kim)).id);
  await pool.query("update jobs set pencil_date = $2, pencil_time = '11:00', pencil_surveyor = 'tom', pencil_until = now() + interval '1 day' where id = $1", [job, DATE]);
  await post({ op: 'unbook', kind: 'job', id: job });
  assert.equal((await jobOf(kim)).pencil_date, null);
  await post({ op: 'close', kind: 'job', id: job, reason: 'Booked elsewhere' });
  assert.equal((await jobOf(kim)).status, 'cancelled');
  assert.equal((await post({ op: 'move', kind: 'job', id: job, to: 'waiting' })).status, 200);
  const j = await jobOf(kim);
  assert.deepEqual([j.status, j.sched_stage, j.date_set], ['booked', 'waiting', false]);
});

test('an old enquiry being worked stays on the board; an old new one ages off', async () => {
  const { board } = await import('../lib/scheduling.js');
  const cold = await lead('Old cold', 'a@example.com', { created: '2020-01-01', stage: 'cold' });
  const stale = await lead('Old new', 'b@example.com', { created: '2020-01-01' });
  await pool.query("update leads set updated_at = '2020-01-01' where id = $1", [stale]);
  const ids = (await board(['dampscan'], '2030-05-20')).cards.map((c) => c.id);
  assert.ok(ids.includes(cold));
  assert.ok(!ids.includes(stale));
});

test('a repeat form carries the agent and choice, and folds into an undated job card', async () => {
  const { mergeDuplicates } = await import('../lib/merge-dupes.js');
  const first = await lead('Kim', 'kim@example.com', { choice: { service: 'damp', name: 'Damp survey', price: 215 } });
  await post({ op: 'agent', kind: 'lead', id: first, agent: { name: 'Savills' } });
  const second = await lead('Kim', 'kim@example.com');
  await mergeDuplicates(second);
  const s = (await pool.query('select estate_agent_id, survey_choice from leads where id = $1', [second])).rows[0];
  assert.ok(s.estate_agent_id);
  assert.equal(s.survey_choice.name, 'Damp survey');
  await post({ op: 'book', kind: 'lead', id: second, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  await post({ op: 'unbook', kind: 'job', id: Number((await jobOf(second)).id) });
  const third = await lead('Kim', 'kim@example.com');
  assert.equal(await mergeDuplicates(third), 1);
  assert.match((await pool.query('select closed_reason from leads where id = $1', [third])).rows[0].closed_reason, /job card/);
});

test('ChatGPT can unbook, close and bring back through the same route', async () => {
  const { SCHED_TOOLS } = await import('../lib/mcp/sched-tools.js');
  const move = SCHED_TOOLS.find((t) => t.name === 'move_on_board');
  const kim = await lead('Kim', 'kim@example.com');
  await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  const job = Number((await jobOf(kim)).id);
  const scope = await owners();
  const run = (args) => move.run(scope, args);
  assert.equal((await run({ id: job, to: 'unbook' })).status, 200);
  assert.equal((await jobOf(kim)).date_set, false);
  await run({ id: job, to: 'not_going_ahead', reason: 'No answer' });
  assert.equal((await jobOf(kim)).status, 'cancelled');
  await run({ id: job, to: 'cold' });
  assert.deepEqual([(await jobOf(kim)).status, (await jobOf(kim)).sched_stage], ['booked', 'cold']);
});

test('booking an enquiry with no survey picked says so in words, and a pencilled time books once it is picked', async () => {
  const mike = await lead('Mike', 'mike@example.com');
  await post({ op: 'pencil', kind: 'lead', id: mike, date: DATE, time: '16:00', surveyor: 'tom', force: true });
  const none = await post({ op: 'book', kind: 'lead', id: mike, date: DATE, time: '16:00', surveyor: 'tom', surveyType: '', force: true });
  assert.equal(none.status, 400);
  assert.match(none.data.error, /Pick the survey/);
  const ok = await post({ op: 'book', kind: 'lead', id: mike, date: DATE, time: '16:00', surveyor: 'tom', surveyType: 'localised', force: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const job = await jobOf(mike);
  assert.equal(String(job.job_time).slice(0, 5), '16:00');
  assert.equal(job.pencil_date, null);
});

test('a booked survey\'s type and price can be changed after booking, and the change is in its history', async () => {
  const ed = await lead('Edwards', 'ed@example.com');
  await post({ op: 'book', kind: 'lead', id: ed, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  const job = Number((await jobOf(ed)).id);
  const r = await post({ op: 'survey', kind: 'job', id: job, pricePounds: 495 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(Number((await jobOf(ed)).survey_price_pence), 49500);
  assert.match(r.data.said, /Localised at £495 \(was Localised at £\d+\)/);
  const bad = await post({ op: 'survey', kind: 'job', id: job, surveyType: 'castle' });
  assert.equal(bad.status, 400);
  const said = (await pool.query("select after_json->>'said' as s from audit where entity = 'job' and entity_id = $1 and action = 'survey_change'", [job])).rows[0].s;
  assert.match(said, /Survey changed to/);
});

test('the website form\'s agent becomes the enquiry\'s agent: names with commas, emails with dots, and older enquiries on the next board load', async () => {
  const { agentFromNotes } = await import('../lib/estate-agents.js');
  assert.deepEqual(agentFromNotes('Estate agent to be contacted to arrange access: Smith & Co, West Malling, 01732 123456, J.Smith@smith.co.uk. Back door sticks.'),
    { name: 'Smith & Co', branch: 'West Malling', phone: '01732 123456', email: 'J.Smith@smith.co.uk' });
  const kim = await lead('Kim', 'kim@example.com');
  await pool.query("update leads set notes = 'Estate agent to be contacted to arrange access: Foxtons, Bexley, 02081234567.' where id = $1", [kim]);
  const { board } = await import('../lib/scheduling.js');
  await board(['dampscan'], DATE);
  const a = (await pool.query('select a.name, a.branch, a.phone from leads l join estate_agents a on a.id = l.estate_agent_id where l.id = $1', [kim])).rows[0];
  assert.deepEqual(a, { name: 'Foxtons', branch: 'Bexley', phone: '02081234567' });
});
