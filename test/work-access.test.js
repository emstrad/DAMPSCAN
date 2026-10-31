/**
 * Staff the owner adds from ChatGPT, and what a 'work' surveyor may do: read
 * every job in their businesses, mark surveys done and reports sent, nothing
 * else, and see a customer's contact details only on their own jobs.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'work-access-test-secret-long-enough-x';
process.env.IP_SALT = 'work-access-test-salt';
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
const { callTool } = await import('../lib/routes/admin/mcp.js');
const { TOOLS } = await import('../lib/mcp/tools.js');
const { scopeFor } = await import('../lib/access.js');
const { toolAllowed } = await import('../lib/work-only.js');

function makeReq({ method = 'GET', url, body, headers = {} }) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.8', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.8' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, write(c) { this.body = (this.body || '') + c; }, end(p) { if (p) this.body = (this.body || '') + p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
const signIn = async (code) => {
  const res = await call(login, { method: 'POST', url: '/api/auth/login', body: { code } });
  if (res.statusCode !== 200) return null;
  const raw = res.getHeader('set-cookie');
  return { cookie: (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0] };
};
async function person(name, code, grants, { isAdmin = false, level = 'work' } = {}) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  return { id: Number(rows[0].id), ...(await signIn(code)) };
}
const api = (who, method, url, body) => call(dispatch, { method, url, body, headers: { cookie: who.cookie } });
const scopeOf = (who) => scopeFor({ person: true, sub: who.id });
const tool = (name) => TOOLS.find((t) => t.name === name);

let owner; let D;
before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, todos, job_payments restart identity cascade');
  D = (await pool.query(`select (now() at time zone 'Europe/London')::date::text as today`)).rows[0];
  owner = await person('Scott', 'owner-1', ['dampscan', 'ati-london', 'roofing', 'ac'], { isAdmin: true, level: 'manage' });
});
after(async () => { await pool.end(); });

const book = async (surveyor, name, postcode, phone) => (await api(owner, 'POST', '/api/admin/jobs', {
  site: 'dampscan', surveyType: 'localised', surveyor, customerName: name, customerPostcode: postcode, customerPhone: phone, customerEmail: 'c@example.com', jobDate: D.today })).json().job.id;

test('the owner adds Ronnie from ChatGPT: a unique six digit passcode, shown once, stored only as a hash', async () => {
  const scope = await scopeOf(owner);
  const out = await tool('add_person').run(scope, { name: 'Ronnie', businesses: ['ati-london', 'dampscan'] });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.match(out.data.passcode, /^\d{6}$/);
  assert.match(out.data.instruction, /exactly once/);
  const row = (await pool.query(`select passcode_hash from people where name = 'Ronnie'`)).rows[0];
  assert.ok(row.passcode_hash.startsWith('$argon2id$'));
  assert.ok(!row.passcode_hash.includes(out.data.passcode));
  const grants = (await pool.query(`select business_slug, level from grants g join people p on p.id = g.person_id where p.name = 'Ronnie' order by 1`)).rows;
  assert.deepEqual(grants, [{ business_slug: 'ati-london', level: 'work' }, { business_slug: 'dampscan', level: 'work' }]);
  assert.ok(await signIn(out.data.passcode), 'Ronnie signs in with it');
  const audit = JSON.stringify((await pool.query(`select * from audit where entity = 'person'`)).rows);
  assert.ok(audit.includes('person_create') && !audit.includes(out.data.passcode), 'audited, without the passcode');
  const listed = await tool('list_people').run(scope, {});
  assert.ok(!JSON.stringify(listed.data).includes(out.data.passcode) && !JSON.stringify(listed.data).includes('argon2'));
});

test('a name already used is refused unless confirmed, and a non-admin cannot add anyone', async () => {
  const scope = await scopeOf(owner);
  await tool('add_person').run(scope, { name: 'Ben', businesses: ['roofing'] });
  const again = await tool('add_person').run(scope, { name: ' ben ', businesses: ['roofing'] });
  assert.equal(again.status, 400);
  assert.match(again.data.error, /already somebody called Ben/);
  assert.equal((await tool('add_person').run(scope, { name: 'ben', businesses: ['roofing'], confirm_duplicate: true })).status, 200);
  const worker = await person('Wendy', 'wendy-1', ['roofing'], { level: 'manage' });
  const no = await tool('add_person').run(await scopeOf(worker), { name: 'Eve', businesses: ['roofing'] });
  assert.equal(no.status, 403);
  assert.equal((await tool('reset_passcode').run(await scopeOf(worker), { name: 'Ben' })).status, 403);
  assert.equal((await tool('add_person').run(scope, { name: 'X', businesses: ['plumbing'] })).status, 400);
});

test('access changes, a passcode reset and deactivation all take effect at once', async () => {
  const scope = await scopeOf(owner);
  const first = (await tool('add_person').run(scope, { name: 'Ben', businesses: ['roofing'] })).data.passcode;
  const set = await tool('set_person_access').run(scope, { name: 'BEN', businesses: ['ati-london', 'dampscan', 'roofing'], level: 'work' });
  assert.equal(set.status, 200);
  assert.equal(set.data.person.businesses.length, 3);
  const second = (await tool('reset_passcode').run(scope, { name: 'Ben' })).data.passcode;
  assert.notEqual(second, first);
  assert.equal(await signIn(first), null, 'the old code stops');
  const ben = await signIn(second);
  assert.ok(ben);
  assert.equal((await tool('deactivate_person').run(scope, { name: 'Ben' })).status, 200);
  assert.notEqual((await api(ben, 'GET', '/api/admin/me')).statusCode, 200, 'their session stops');
  const actions = (await pool.query(`select action from audit where entity = 'person' order by id`)).rows.map((r) => r.action);
  assert.deepEqual(actions, ['person_create', 'person_access', 'person_passcode_reset', 'person_deactivate']);
});

test('a work surveyor can mark surveyed and report sent, and nothing that touches money, dates or jobs', async () => {
  const ronnie = await person('Ronnie', 'ron-1', ['dampscan', 'ati-london']);
  const id = await book('ronnie', 'Sam Lee', 'ME14 2AB', '07700 900222');
  assert.equal((await api(ronnie, 'POST', '/api/admin/surveys', { op: 'move', id, to: 'surveyed' })).statusCode, 200);
  assert.equal((await api(ronnie, 'POST', '/api/admin/clients', { id, surveySent: true })).statusCode, 200);
  const refusals = [
    ['/api/admin/clients', { id, paid: true }], ['/api/admin/clients', { id, depositPaid: true }], ['/api/admin/clients', { id, jobDate: D.today }],
    ['/api/admin/surveys', { op: 'tick', id, what: 'paid', on: true }], ['/api/admin/surveys', { op: 'move', id, to: 'paid' }],
    ['/api/admin/surveys', { op: 'remedial', id, status: 'won', amountPence: 100 }], ['/api/admin/jobs', { site: 'dampscan', surveyor: 'ronnie', surveyType: 'localised', customerName: 'New' }],
    ['/api/admin/quoted', { op: 'payment', id, amountPence: 100 }], ['/api/admin/leads', { id: 1, op: 'close' }]
  ];
  for (const [url, body] of refusals) {
    const res = await api(ronnie, 'POST', url, body);
    assert.equal(res.statusCode, 403, url + JSON.stringify(body));
    assert.match(res.json().message, /whoever manages/);
  }
  assert.equal((await api(ronnie, 'DELETE', '/api/admin/jobs', { id })).statusCode, 403);
  const paid = (await pool.query('select paid_at, deposit_paid_at, survey_sent_at, status from jobs where id = $1', [id])).rows[0];
  assert.equal(paid.paid_at, null);
  assert.equal(paid.deposit_paid_at, null);
  assert.ok(paid.survey_sent_at);
});

test('a work surveyor\'s ChatGPT lists only reads (and mark_report_sent) and refuses a write called by name', async () => {
  const ronnie = await person('Ronnie', 'ron-2', ['dampscan']);
  const scope = await scopeOf(ronnie);
  const id = await book('ronnie', 'Sam Lee', 'ME14 2AB', '07700 900222');
  const listed = TOOLS.filter((t) => toolAllowed(scope, t));
  assert.ok(listed.every((t) => t.annotations.readOnlyHint || ['mark_report_sent', 'attach_report'].includes(t.name)));
  assert.ok(listed.some((t) => t.name === 'mark_report_sent'));
  assert.ok(!listed.some((t) => t.name === 'mark_paid_in_full'));
  const paid = await callTool(scope, { name: 'mark_paid_in_full', arguments: { id } });
  assert.equal(paid.isError, true);
  assert.match(paid.content[0].text, /whoever manages/);
  const sent = await callTool(scope, { name: 'mark_report_sent', arguments: { id } });
  assert.ok(!sent.isError, JSON.stringify(sent.content));
  assert.equal((await pool.query('select paid_at from jobs where id = $1', [id])).rows[0].paid_at, null);
  /* The owner keeps every tool. */
  assert.equal(TOOLS.filter((t) => toolAllowed({ isAdmin: true }, t)).length, TOOLS.length);
});

test('contact details only on the surveyor\'s own or assigned jobs; others show a first name and district', async () => {
  const ben = await person('Ben Hart', 'ben-1', ['dampscan', 'ati-london']);
  const own = await book('ben', 'Sam Lee', 'ME14 2AB', '07700 900111');
  const other = await book('tom', 'Ann Bell', 'ME15 6XY', '07700 900333');
  const handed = await book('tom', 'Cal Dee', 'ME16 1AA', '07700 900444');
  await pool.query('update jobs set assigned_person_id = $2 where id = $1', [handed, ben.id]);
  const cards = (await api(ben, 'GET', '/api/admin/clients?view=all')).json().clients;
  const byId = (i) => cards.find((c) => c.id === i);
  assert.equal(byId(own).phone, '07700 900111', 'surveyor key "ben" matches "Ben Hart"');
  assert.equal(byId(own).name, 'Sam Lee');
  assert.equal(byId(handed).phone, '07700 900444', 'an assigned job shows its contacts');
  assert.equal(byId(other).phone, undefined);
  assert.equal(byId(other).email, undefined);
  assert.equal(byId(other).name, 'Ann');
  assert.equal(byId(other).address.postcode, 'ME15');
  const found = JSON.stringify((await api(ben, 'GET', '/api/admin/search?q=Bell')).json());
  assert.ok(!found.includes('900333') && !found.includes('Bell"'), found);
  const viaTool = JSON.stringify((await tool('get_job').run(await scopeOf(ben), { id: other })).data);
  assert.ok(!viaTool.includes('900333'), viaTool);
  assert.ok(!/Pence":[1-9]/.test(viaTool), 'no figures through the assistant either');
});

test('a damp-only surveyor asking for a roofing job gets nothing', async () => {
  const ronnie = await person('Ronnie', 'ron-3', ['dampscan']);
  const roof = (await pool.query(`insert into jobs (site, status, invoice_net_pence, customer_name, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('roofing','booked',1000,'Roy',0,0,'','','') returning id`)).rows[0].id;
  const res = await api(ronnie, 'GET', `/api/admin/calendar?view=job&id=${roof}`);
  assert.ok([403, 404].includes(res.statusCode) || !JSON.stringify(res.json()).includes('Roy'));
  assert.equal((await tool('get_job').run(await scopeOf(ronnie), { id: roof })).status, 404);
});

test('a work surveyor sets his own hours on the My hours calendar, and nobody else\'s', async () => {
  const ronnie = await person('Ronnie', 'ron-4', ['dampscan', 'ati-london']);
  await pool.query("delete from surveyor_hours where surveyor in ('ronnie', 'tom')");
  const days = ['2030-03-04', '2030-03-05'];
  const mine = await api(ronnie, 'POST', '/api/admin/hours', { op: 'bulk', action: 'replace', dates: days, start: '09:00', end: '17:00' });
  assert.equal(mine.statusCode, 200, JSON.stringify(mine.json()));
  assert.equal(Number((await pool.query("select count(*) from surveyor_hours where surveyor = 'ronnie' and on_date = any($1::date[])", [days])).rows[0].count), 2);
  for (const op of [{ op: 'remove_window', date: days[0], start: '09:00', end: '17:00' }, { op: 'set_usual', weekdays: [1], windows: [{ start: '09:00', end: '13:00' }] }]) {
    assert.equal((await api(ronnie, 'POST', '/api/admin/hours', op)).statusCode, 200, op.op);
  }
  const theirs = await api(ronnie, 'POST', '/api/admin/hours', { op: 'bulk', action: 'replace', dates: days, start: '09:00', end: '17:00', surveyor: 'tom' });
  assert.notEqual(theirs.statusCode, 200);
  assert.equal((await api(ronnie, 'POST', '/api/admin/hours', { op: 'flag', key: 'booking_slots', enabled: true })).statusCode, 403);
});

test('Ben and Tom, managers, set their own hours on the calendar and can set a surveyor\'s', async () => {
  const ben = await person('Ben', 'ben-1', ['dampscan', 'ati-london', 'roofing'], { level: 'manage' });
  const tom = await person('Tom', 'tom-1', ['dampscan', 'ati-london'], { level: 'manage' });
  await pool.query("delete from surveyor_hours where surveyor in ('ben', 'tom', 'ronnie')");
  const days = ['2030-04-01'];
  for (const [who, name] of [[ben, 'ben'], [tom, 'tom']]) {
    const r = await api(who, 'POST', '/api/admin/hours', { op: 'bulk', action: 'replace', dates: days, start: '10:00', end: '16:00' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.json()));
    assert.equal(Number((await pool.query('select count(*) from surveyor_hours where surveyor = $1', [name])).rows[0].count), 1, name);
    assert.equal((await api(who, 'POST', '/api/admin/hours', { op: 'set_usual', weekdays: [2], windows: [{ start: '09:00', end: '17:00' }] })).statusCode, 200);
  }
  assert.equal((await api(ben, 'POST', '/api/admin/hours', { op: 'bulk', action: 'replace', dates: days, start: '09:00', end: '12:00', surveyor: 'ronnie' })).statusCode, 200);
});
