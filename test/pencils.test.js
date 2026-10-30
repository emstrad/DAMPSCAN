/**
 * Pencilled times: grey on Today, off the free list, shared times flagged,
 * the first booking bumps the other back to Waiting with a to-do, a lapsed
 * hold drops back on its own, and the inbox scan logs emails on the card.
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
const calendar = (await import('../lib/routes/admin/calendar.js')).default;
const { expirePencils } = await import('../lib/pencils.js');
const { freeSlots } = await import('../lib/availability.js');
const { scanMail } = await import('../lib/mail-scan.js');
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

const lead = async (name, email) => Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id)
  values ('dampscan', 'complete', $1, 'ME19 6AB', $2, gen_random_uuid()) returning id`, [name, email])).rows[0].id);

test('two pencilled on one time: both grey on Today, first booked bumps the other', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  const raj = await lead('Raj', 'raj@example.com');
  assert.equal((await post({ op: 'pencil', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom' })).status, 200);
  const second = await post({ op: 'pencil', kind: 'lead', id: raj, date: DATE, time: '10:00', surveyor: 'tom' });
  assert.deepEqual(second.data.sharing, ['Kim']);

  const cal = await callRoute(calendar, await owners(), { method: 'GET', url: `/api/admin/calendar?view=work&from=${DATE}&to=${DATE}` });
  assert.equal(cal.data.pencils.length, 2);
  assert.ok(cal.data.pencils.every((p) => p.sharing.length === 1 && p.kind === 'pencil'));
  assert.ok(!cal.data.events.some((e) => e.customerName === 'Kim'), 'a pencil is never a booked event');

  const free = await freeSlots({ today: '2030-05-20', days: 20 });
  assert.ok(!free.some((s) => s.date === DATE && ['09:00', '10:00', '11:00'].includes(s.time)), 'pencilled time is off the free list');

  const booked = await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  assert.equal(booked.status, 200, JSON.stringify(booked.data));
  assert.deepEqual(booked.data.bumped, ['Raj']);
  const r = (await pool.query('select pencil_date, sched_stage from leads where id = $1', [raj])).rows[0];
  assert.equal(r.pencil_date, null);
  assert.equal(r.sched_stage, 'waiting');
  const todo = (await pool.query('select text from todos')).rows;
  assert.equal(todo.length, 1);
  assert.match(todo[0].text, /Offer Raj \(ME19\) another time/);
});

test('a hold past its 48 hours lapses back to Waiting with a to-do', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  await post({ op: 'pencil', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom' });
  await pool.query("update leads set pencil_until = now() - interval '1 minute'");
  assert.equal(await expirePencils(), 1);
  assert.equal((await pool.query('select pencil_date from leads')).rows[0].pencil_date, null);
  assert.match((await pool.query('select text from todos')).rows[0].text, /lapsed/);
});

test('the inbox scan logs a reply and an incoming email on the card, once', async () => {
  Object.assign(process.env, { M365_TENANT_ID: 't', M365_CLIENT_ID: 'c', M365_CLIENT_SECRET: 's', M365_MAILBOX: 'office@dampscan.co.uk' });
  const kim = await lead('Kim', 'kim@example.com');
  await lead('Pat', 'shared@example.com'); await lead('Sam', 'shared@example.com');
  const msgs = [
    { id: 'm1', subject: 'Survey enquiry', from: { emailAddress: { address: 'Kim@example.com' } }, toRecipients: [], receivedDateTime: '2030-05-01T09:00:00Z' },
    { id: 'm2', subject: 'Re: Survey enquiry', from: { emailAddress: { address: 'office@dampscan.co.uk' } }, toRecipients: [{ emailAddress: { address: 'kim@example.com' } }], receivedDateTime: '2030-05-01T10:00:00Z' },
    { id: 'm3', subject: 'Hello', from: { emailAddress: { address: 'shared@example.com' } }, toRecipients: [], receivedDateTime: '2030-05-01T11:00:00Z' }
  ];
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes('oauth2') ? { access_token: 'x' } : { value: msgs }) });
  assert.deepEqual(await scanMail({ fetchImpl }), { logged: 2 }, 'the shared address is left for the sweep');
  assert.deepEqual(await scanMail({ fetchImpl }), { logged: 0 }, 'never twice');
  const l = (await pool.query('select sched_stage, sched_log from leads where id = $1', [kim])).rows[0];
  assert.equal(l.sched_stage, 'contacted');
  assert.deepEqual(l.sched_log.map((x) => x.note), ['They emailed: Survey enquiry', 'Replied: Re: Survey enquiry']);
  for (const k of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_MAILBOX']) delete process.env[k];
});

test('a survey booked over a hold elsewhere sends the hold back, and auto-replies are skipped', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  await post({ op: 'pencil', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom' });
  await pool.query(`insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp) values ('dampscan', 'booked', 'tom', $1, '10:30', true, 'Lee', 0, 0, '', '', '', 0, 0, 0, 5000)`, [DATE]);
  assert.equal(await expirePencils(), 1);
  assert.match((await pool.query('select text from todos')).rows[0].text, /booked for another survey/);

  Object.assign(process.env, { M365_TENANT_ID: 't', M365_CLIENT_ID: 'c', M365_CLIENT_SECRET: 's', M365_MAILBOX: 'office@dampscan.co.uk' });
  const msgs = [{ id: 'oo', subject: 'Automatic reply: Survey', from: { emailAddress: { address: 'kim@example.com' } }, toRecipients: [] }];
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes('oauth2') ? { access_token: 'x' } : { value: msgs }) });
  assert.deepEqual(await scanMail({ fetchImpl }), { logged: 0 });
  for (const k of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_MAILBOX']) delete process.env[k];
});

test('Who\'s free lists every surveyor at the same time, not one per time', async () => {
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ('ben', $1, '09:00', '11:00')`, [DATE]);
  const s = await owners();
  const got = await callRoute(route, s, { method: 'GET', url: '/api/admin/scheduling' });
  assert.equal(got.status, 200);
  const free = await freeSlots({ today: '2030-05-25', days: 10, perSurveyor: true });
  const nine = free.filter((x) => x.date === DATE && x.time === '09:00').map((x) => x.surveyor).sort();
  assert.deepEqual(nine, ['ben', 'tom']);
});

test('a booked survey can be unbooked: off the diary, back to Waiting, card kept', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  const booked = await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  assert.equal(booked.status, 200, JSON.stringify(booked.data));
  const job = (await pool.query('select id from jobs where lead_id = $1', [kim])).rows[0].id;
  const off = await post({ op: 'unbook', kind: 'job', id: Number(job) });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  const j = (await pool.query('select status, date_set, job_time, sched_stage from jobs where id = $1', [job])).rows[0];
  assert.deepEqual([j.status, j.date_set, j.job_time, j.sched_stage], ['booked', false, null, 'waiting']);
  const { board } = await import('../lib/scheduling.js');
  assert.ok((await board(['dampscan', 'ati-london'], '2030-05-20')).cards.some((c) => c.kind === 'job' && c.id === Number(job)), 'back on the To book board');
  assert.equal((await post({ op: 'unbook', kind: 'job', id: Number(job) })).status, 400, 'twice is refused');
});

test('a card can go cold and come back, and a job card can be closed as not going ahead', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  assert.equal((await post({ op: 'move', kind: 'lead', id: kim, to: 'cold' })).status, 200);
  const { board } = await import('../lib/scheduling.js');
  assert.equal((await board(['dampscan', 'ati-london'], '2030-05-20')).cards.find((c) => c.id === kim).stage, 'cold');
  await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  const job = Number((await pool.query('select id from jobs where lead_id = $1', [kim])).rows[0].id);
  await post({ op: 'unbook', kind: 'job', id: job });
  const shut = await post({ op: 'close', kind: 'job', id: job, reason: 'Booked elsewhere' });
  assert.equal(shut.status, 200, JSON.stringify(shut.data));
  assert.equal((await pool.query('select status from jobs where id = $1', [job])).rows[0].status, 'cancelled');
  assert.ok(!(await board(['dampscan', 'ati-london'], '2030-05-20')).cards.some((c) => c.kind === 'job' && c.id === job), 'off the board');
});

test('an enquiry keeps its estate agent (from the form or added) and the job gets it when booked', async () => {
  const kim = await lead('Kim', 'kim@example.com');
  await pool.query("update leads set notes = 'Estate agent to be contacted to arrange access: Foxtons Bromley, 020 8460 1234, b@foxtons.co.uk. Damp hall.' where id = $1", [kim]);
  const { board } = await import('../lib/scheduling.js');
  const card = (await board(['dampscan', 'ati-london'], '2030-05-20')).cards.find((c) => c.id === kim);
  assert.equal(card.agent, 'Foxtons Bromley');
  assert.equal(card.agentInfo.phone, '020 8460 1234');
  const saved = await post({ op: 'agent', kind: 'lead', id: kim, agent: { name: 'Savills', branch: 'Sevenoaks', phone: '01732 000000' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await board(['dampscan', 'ati-london'], '2030-05-20')).cards.find((c) => c.id === kim).agent, 'Savills');
  await post({ op: 'book', kind: 'lead', id: kim, date: DATE, time: '10:00', surveyor: 'tom', surveyType: 'localised', force: true });
  const a = (await pool.query('select a.name from jobs j join estate_agents a on a.id = j.estate_agent_id where j.lead_id = $1', [kim])).rows[0];
  assert.equal(a.name, 'Savills');
});

test('a part-finished damp form can be put on Scheduling and booked', async () => {
  const { scheduleLead } = await import('../lib/lead-status.js');
  const { board } = await import('../lib/scheduling.js');
  const id = Number((await pool.query(`insert into leads (site, stage, first_name, postcode, phone, email, session_id)
    values ('dampscan', 'partial', 'Pat', 'ME19 4AA', '07700900123', 'pat@example.com', gen_random_uuid()) returning id`)).rows[0].id);
  assert.ok(!(await board(['dampscan'], '2030-05-20')).cards.some((c) => c.id === id), 'a partial is not on the board');
  const out = await scheduleLead(await owners(), id);
  assert.equal(out.id, id);
  const card = (await board(['dampscan'], '2030-05-20')).cards.find((c) => c.kind === 'lead' && c.id === id);
  assert.equal(card.stage, 'new');
  assert.match(card.log.at(-1).note, /part-finished form/);
});
