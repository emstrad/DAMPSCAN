/**
 * The damp survey board: booking with an estate agent, the columns in the
 * owners' order, Undo, the report rule, remedial work and the day sheet.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'surveys-test-secret-long-enough-xxxxx';
process.env.IP_SALT = 'surveys-test-salt';
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
const dispatch = (await import('../api/admin/[action].js')).default;

function makeReq({ method = 'GET', url, body, headers = {} }) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.9' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function person(name, code, grants, isAdmin = false, level = 'manage') {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  const raw = (await call(login, { method: 'POST', url: '/api/auth/login', body: { code } })).getHeader('set-cookie');
  return { id: Number(rows[0].id), cookie: (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0] };
}
const api = (who, method, url, body) => call(dispatch, { method, url, body, headers: { cookie: who.cookie } });
let D;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, estate_agents, notifications, todos, job_photos restart identity cascade');
  D = (await pool.query(`select d::text as today, (d + 1)::text as tomorrow, (d - 5)::text as past from (select (now() at time zone 'Europe/London')::date as d) x`)).rows[0];
});
after(async () => { await pool.end(); });

const book = async (who, body) => (await api(who, 'POST', '/api/admin/jobs', { site: 'dampscan', surveyType: 'localised', surveyor: 'tom', customerName: 'Sam Lee', customerPostcode: 'ME14 2AB', customerPhone: '07700 900222', ...body })).json();
const op = async (who, body) => api(who, 'POST', '/api/admin/surveys', body);
const boardOf = async (who) => (await api(who, 'GET', '/api/admin/surveys?area=damp')).json();
const stage = async (who, id) => (await boardOf(who)).surveys.find((s) => s.id === id).stage;

test('a survey books with its estate agent, and the agent is kept once', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan', 'ati-london']);
  await pool.query(`insert into leads (site, stage, first_name, email, phone, postcode, session_id) values ('dampscan', 'complete', 'Priya', 'p@x.com', '07700 900111', 'ME14 1AA', gen_random_uuid())`);
  assert.deepEqual((await boardOf(boss)).enquiries.map((e) => e.firstName), ['Priya'], 'a finished enquiry sits in the first column');
  const a = await book(boss, { jobDate: D.tomorrow, jobTime: '10:00', awaitingAgent: true, estateAgent: { name: 'Jo Foxtons', branch: 'Maidstone', phone: '01622 000000' } });
  assert.equal(a.ok, true);
  const b = await book(boss, { customerName: 'Ann Other', jobDate: D.tomorrow, estateAgent: { name: 'jo foxtons', branch: 'MAIDSTONE', email: 'jo@foxtons.example' } });
  const plain = await book(boss, { customerName: 'Direct Customer', jobDate: D.tomorrow });
  const board = await boardOf(boss);
  const s = board.surveys.find((x) => x.id === a.job.id);
  assert.equal(s.stage, 'booked', 'waiting on the agent is a badge on Booked, not a column');
  assert.equal(s.awaitingAgent, true);
  assert.equal(s.pricePence, 21500, 'the rate card price');
  assert.equal(board.surveys.find((x) => x.id === b.job.id).agent.id, s.agent.id, 'the same agent, whatever the case');
  assert.equal(board.surveys.find((x) => x.id === plain.job.id).agent, null, 'most surveys are booked with the customer');
  const agents = (await api(boss, 'GET', '/api/admin/surveys?view=agents')).json();
  assert.equal(agents.agents.length, 1);
  assert.deepEqual([agents.agents[0].jobs, agents.agents[0].waiting.length, agents.agents[0].email], [2, 1, 'jo@foxtons.example']);
  assert.equal(agents.top[0].yearJobs, 2);
  const msgs = (await api(boss, 'GET', `/api/admin/surveys?view=messages&id=${a.job.id}`)).json().messages;
  assert.match(msgs.chase.text, /^Hi Jo, can you confirm a time/);
  assert.equal(msgs.chase.links.sms, null, 'a landline cannot take a text');
  assert.match(msgs.confirm.text, /waiting on Jo Foxtons/);
  assert.match(msgs.deposit.text, /£107\.50/);
  assert.ok(msgs.confirm.links.whatsapp.startsWith('https://wa.me/447700900222'));
});

test('a card moves through the owners\' order, and Undo puts it back exactly', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan']);
  const id = (await book(boss, { jobDate: D.past })).job.id;
  assert.equal(await stage(boss, id), 'surveyed', 'the date has passed');
  assert.equal((await op(boss, { op: 'move', id, to: 'sent' })).statusCode, 400, 'the report goes after the money');
  const paid = (await op(boss, { op: 'move', id, to: 'paid' })).json();
  assert.equal(paid.survey.stage, 'paid');
  assert.equal(paid.survey.deposit, true, 'paid in full covers the deposit');
  assert.equal(paid.survey.reportDays, 0, 'owed from the payment, which was today');
  await pool.query(`update jobs set paid_at = (((now() at time zone 'Europe/London')::date - 3) + time '12:00') at time zone 'Europe/London' where id = $1`, [id]);
  const late = (await boardOf(boss)).surveys[0];
  assert.deepEqual([late.reportDays, late.reportLate], [3, true], 'red after two days');
  const sent = (await op(boss, { op: 'move', id, to: 'sent' })).json();
  assert.equal(sent.survey.stage, 'sent');
  assert.equal((await op(boss, sent.undo)).statusCode, 200);
  const back = (await pool.query('select paid_at < now() - interval \'2 days\' as kept, survey_sent_at from jobs where id = $1', [id])).rows[0];
  assert.deepEqual([back.kept, back.survey_sent_at], [true, null], 'undo restores the original payment time');
  const tick = (await op(boss, { op: 'tick', id, what: 'paid', on: false })).json();
  assert.equal(tick.survey.stage, 'surveyed');
});

test('remedial work: quoting is a hope, won counts in the payout, Today nudges after three days', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan']);
  const id = (await book(boss, { jobDate: D.past })).job.id;
  await pool.query(`update jobs set paid_at = now() - interval '5 days', survey_sent_at = now() - interval '4 days' where id = $1`, [id]);
  const today = (await api(boss, 'GET', `/api/admin/calendar?view=work&from=${D.past}&to=${D.tomorrow}`)).json();
  const group = today.work.groups.find((g) => g.key === 'remedial');
  assert.deepEqual(group.items.map((i) => i.jobId), [id]);
  const before = (await pool.query('select pay_scott_pence from jobs where id = $1', [id])).rows[0].pay_scott_pence;
  const q = (await op(boss, { op: 'remedial', id, status: 'quoting', amountPence: 240000 })).json();
  assert.deepEqual([q.survey.remedial.status, q.survey.remedial.quotePence, q.survey.remedial.wonPence], ['quoting', 240000, 0]);
  const won = (await op(boss, { op: 'remedial', id, status: 'won' })).json();
  assert.equal(won.survey.remedial.wonPence, 240000, 'the quoted figure, once won');
  const after1 = (await pool.query('select pay_scott_pence from jobs where id = $1', [id])).rows[0].pay_scott_pence;
  assert.ok(after1 > before, 'the lead fee on remedial work reaches the payout');
  await op(boss, won.undo);
  const undone = (await pool.query('select remedial_status, remedial_pence, pay_scott_pence from jobs where id = $1', [id])).rows[0];
  assert.deepEqual([undone.remedial_status, undone.remedial_pence, undone.pay_scott_pence], ['quoting', 0, before]);
});

test('the day sheet is one surveyor\'s day in time order, and other businesses see none of it', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan', 'roofing']);
  await book(boss, { customerName: 'Late One', jobDate: D.tomorrow, jobTime: '14:00' });
  await book(boss, { customerName: 'Early One', jobDate: D.tomorrow, jobTime: '09:00' });
  await book(boss, { customerName: 'Bens', jobDate: D.tomorrow, surveyor: 'ben' });
  const day = (await api(boss, 'GET', `/api/admin/surveys?view=day&date=${D.tomorrow}&surveyor=tom`)).json();
  assert.deepEqual(day.surveys.map((s) => s.name), ['Early One', 'Late One']);
  const roofer = await person('Steve', 'steve-code', ['roofing']);
  assert.deepEqual((await boardOf(roofer)).surveys, []);
  const id = day.surveys[0].id;
  assert.equal((await op(roofer, { op: 'move', id, to: 'surveyed' })).statusCode, 404);
});

test('a report sent before the money stays on After the visit, and can be unticked back to Surveyed', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan']);
  const id = (await book(boss, { jobDate: D.past, jobTime: '10:00' })).job.id;
  await pool.query('update jobs set survey_sent_at = now() where id = $1', [id]);
  const s = (await boardOf(boss)).surveys.find((x) => x.id === id);
  assert.deepEqual([s.stage, s.paid], ['sent', false], 'report sent, not paid');
  assert.equal((await op(boss, { op: 'move', id, to: 'paid' })).statusCode, 400, 'not paid, so it does not go back to Paid');
  const back = (await op(boss, { op: 'move', id, to: 'surveyed' })).json();
  assert.equal(back.survey.stage, 'surveyed');
});

test('one report deadline: 24 hours after the survey ends, from the rate card minutes; today\'s survey waits until done', async () => {
  const boss = await person('Scott', 'boss-code', ['dampscan']);
  await pool.query(`update job_rates set duration_min = 120 where key = 'localised'`);
  const id = (await book(boss, { jobDate: D.past, jobTime: '10:00' })).job.id;
  const s = (await boardOf(boss)).surveys.find((x) => x.id === id);
  const want = (await pool.query(`select ((($1::date + time '12:00') at time zone 'Europe/London') + interval '24 hours') as d`, [D.past])).rows[0].d;
  assert.equal(s.reportDeadline, new Date(want).toISOString(), 'start plus two hours on site, plus 24 hours');
  const untimed = (await book(boss, { customerName: 'No Time', jobDate: D.past })).job.id;
  const u = (await boardOf(boss)).surveys.find((x) => x.id === untimed);
  const end = (await pool.query(`select ((($1::date + 1)::timestamp at time zone 'Europe/London') + interval '24 hours') as d`, [D.past])).rows[0].d;
  assert.equal(u.reportDeadline, new Date(end).toISOString(), 'an untimed survey ends with its day');
  await book(boss, { customerName: 'Later Today', jobDate: D.today, jobTime: '23:30' });
  const owed = (await api(boss, 'GET', '/api/admin/surveys?view=reports')).json().surveys.map((x) => x.name);
  assert.ok(!owed.includes('Later Today'), 'a survey still to happen today is not owed a report');
  await pool.query(`update job_rates set duration_min = 60 where key = 'localised'`);
});
