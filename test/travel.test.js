/**
 * Travel time between surveys and the other scheduling edges: a time inside
 * the drive from a survey across London is refused everywhere (board, client
 * card) unless forced; nearby is fine. Duplicates show on the board, a
 * buyer waiting on the agent is held by hand, two people pencilling at once
 * see each other, removed hours send a hold back, and the inbox matches
 * booked jobs and a new address by postcode.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'travel-secret-long-enough-xxxxxxxxxxx';
process.env.IP_SALT = 'travel-salt-long-enough';

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
const clients = (await import('../lib/routes/admin/clients.js')).default;
const { driveMinutes } = await import('../lib/travel.js');
const { expirePencils } = await import('../lib/pencils.js');
const { freeSlots } = await import('../lib/availability.js');
const { scanMail } = await import('../lib/mail-scan.js');
const owners = () => scopeFor({ person: false, name: 'Owners' });
const post = async (body, name = 'Owners') => callRoute(route, { ...(await owners()), name }, { method: 'POST', url: '/api/admin/scheduling', body });
const DATE = '2030-06-01';
const JOB = `insert into jobs (site, status, surveyor, job_date, job_time, date_set, customer_name, customer_postcode, customer_email, awaiting_agent, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
  values ('dampscan', 'booked', 'tom', $1, $2, $3, $4, $5, $6, $7, 0, 0, '', '', '', 0, 0, 0, 5000) returning id`;
const job = async (time, name, postcode, { dateSet = true, email = null, agent = false } = {}) => Number((await pool.query(JOB, [dateSet ? DATE : new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), time, dateSet, name, postcode, email, agent])).rows[0].id);
const lead = async (name, postcode, email, phone = null) => Number((await pool.query(`insert into leads (site, stage, first_name, postcode, email, phone, session_id)
  values ('dampscan', 'complete', $1, $2, $3, $4, gen_random_uuid()) returning id`, [name, postcode, email, phone])).rows[0].id);

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`insert into job_rates (key, label, price_pence, surveyor_fee_pence, position) values ('localised', 'Localised', 25000, 11000, 1) on conflict (key) do nothing`);
  /* Bromley (BR1), West Malling (ME19), Croydon (CR0) and next door to Bromley. */
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('BR11AA', 51.405, 0.015), ('BR12AA', 51.407, 0.02), ('ME196AB', 51.295, 0.41), ('CR01AA', 51.373, -0.1)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
});
beforeEach(async () => {
  await pool.query('truncate jobs, leads, todos, audit, notifications, surveyor_hours, mail_seen restart identity cascade');
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time) values ('tom', $1, '08:00', '18:00')`, [DATE]);
});
after(async () => { await pool.end(); });

test('drive time grows with distance; next door fits, across the county does not', async () => {
  assert.ok(driveMinutes({ lat: 51.405, lon: 0.015 }, { lat: 51.407, lon: 0.02 }) <= 15);
  assert.ok(driveMinutes({ lat: 51.405, lon: 0.015 }, { lat: 51.295, lon: 0.41 }) >= 45);
  await job('10:00', 'Lee', 'BR1 1AA');
  const near = await lead('Ann', 'BR1 2AA', 'a@x.com');
  const far = await lead('Bob', 'ME19 6AB', 'b@x.com');
  const ok = await post({ op: 'pencil', kind: 'lead', id: near, date: DATE, time: '11:15', surveyor: 'tom' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const no = await post({ op: 'pencil', kind: 'lead', id: far, date: DATE, time: '11:15', surveyor: 'tom' });
  assert.match(no.data.clash, /minutes' drive/);
  const free = await freeSlots({ today: '2030-05-25', days: 10, postcode: 'ME19 6AB', perSurveyor: true });
  assert.ok(!free.some((s) => s.date === DATE && s.time === '12:00'), 'Bob is too far for noon after a Bromley 10:00');
});

test('the client card refuses a move into the drive, and goes ahead when told', async () => {
  await job('10:00', 'Lee', 'BR1 1AA');
  const id = await job('09:00', 'Kim', 'ME19 6AB');
  await pool.query("update jobs set job_date = $1 where id = $2", ['2030-06-02', id]);
  const s = await owners();
  const no = await callRoute(clients, s, { method: 'POST', url: '/api/admin/clients', body: { id, jobDate: DATE, jobTime: '11:00' } });
  assert.equal(no.status, 400);
  assert.match(no.data.clash, /Lee at 10:00/);
  const yes = await callRoute(clients, s, { method: 'POST', url: '/api/admin/clients', body: { id, jobDate: DATE, jobTime: '11:00', force: true } });
  assert.equal(yes.status, 200, JSON.stringify(yes.data));
});

test('duplicates show, agent buyers are held by hand, and two at once see each other', async () => {
  const l = await lead('Kim', 'BR1 1AA', 'kim@x.com');
  const j = await job(null, 'Kim Smith', 'BR1 1AA', { dateSet: false, email: 'kim@x.com', agent: true });
  const b = (await callRoute(route, await owners(), { method: 'GET', url: '/api/admin/scheduling' })).data;
  assert.deepEqual(b.cards.find((c) => c.kind === 'job').same.map((x) => x.id), [l]);
  const held = await post({ op: 'pencil', kind: 'job', id: j, date: DATE, time: '14:00', surveyor: 'tom' }, 'Ben');
  assert.equal(held.data.byHand, true);
  const second = await post({ op: 'pencil', kind: 'lead', id: l, date: DATE, time: '14:00', surveyor: 'tom' }, 'Tom');
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.match(second.data.recent[0], /Ben pencilled Kim Smith at this time/);
  await pool.query("update jobs set pencil_set_at = now() - interval '5 days'");
  await pool.query("delete from surveyor_hours");
  assert.equal(await expirePencils(), 2, 'both holds lose their hours');
  assert.match((await pool.query('select text from todos order by id')).rows[0].text, /no longer available/);
  assert.equal((await post({ op: 'link', kind: 'job', id: j, leadId: l })).status, 200);
});

test('the inbox logs a booked customer on their job, and a new address by postcode', async () => {
  Object.assign(process.env, { M365_TENANT_ID: 't', M365_CLIENT_ID: 'c', M365_CLIENT_SECRET: 's', M365_MAILBOX: 'office@dampscan.co.uk' });
  const booked = await job('10:00', 'Lee', 'BR1 1AA', { email: 'lee@x.com' });
  const ann = await lead('Ann', 'CR0 1AA', 'ann@x.com');
  const msgs = [
    { id: 'a', subject: 'Can we move?', from: { emailAddress: { address: 'lee@x.com' } }, toRecipients: [] },
    { id: 'b', subject: 'Survey', bodyPreview: 'Hi, this is Ann at CR0 1AA writing from my work address', from: { emailAddress: { address: 'ann@work.com' } }, toRecipients: [] }
  ];
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes('oauth2') ? { access_token: 'x' } : { value: msgs }) });
  assert.deepEqual(await scanMail({ fetchImpl }), { logged: 2 });
  const said = (await pool.query("select after_json->>'said' s from audit where entity = 'job' and entity_id = $1", [booked])).rows.map((r) => r.s);
  assert.deepEqual(said, ['Email from Lee: Can we move?']);
  assert.match((await pool.query('select sched_log from leads where id = $1', [ann])).rows[0].sched_log[0].note, /from ann@work.com/);
  for (const k of ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_MAILBOX']) delete process.env[k];
});
