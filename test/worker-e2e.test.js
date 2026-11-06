/**
 * The surveyors' staff area end to end, through the one admin entry point the
 * live site uses (api/admin/[action].js): Ben signs in at work level and gets
 * only his own day, never money, every customer's contacts, and nothing from
 * the company pages; the owner still sees everything.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'worker-e2e-secret-long-enough-xxxxxxx';
process.env.IP_SALT = 'worker-e2e-salt';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const login = (await import('../lib/routes/auth/login.js')).default;
const admin = (await import('../api/admin/[action].js')).default;

function makeReq({ method = 'GET', url, body, headers = {} }) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.9' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { this.body = p; return this; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const res = makeRes(); await handler(makeReq(init), res); return res; }
async function person(name, code, grants, level, isAdmin = false) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  return Number(rows[0].id);
}
async function signIn(code) {
  const res = await call(login, { method: 'POST', url: '/api/auth/login', body: { code } });
  const raw = res.getHeader('set-cookie');
  return (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0];
}
const get = async (cookie, url) => call(admin, { url, headers: { cookie } });
let today;
async function survey(name, surveyor, time, extra = {}) {
  return Number((await pool.query(
    `insert into jobs (site, customer_name, customer_postcode, customer_phone, customer_email, status, job_date, job_time, date_set, survey_price_pence, surveyor,
                       tax_bp, lead_bp, lead_earner, partner_a, partner_b, deposit_paid_at, assigned_person_id)
     values ('dampscan', $1, 'ME19 4AA', '07700 900222', 'c@x.com', 'booked', $2::date, $3::time, true, 29500, $4, 0, 0, '', '', '', now(), $5) returning id`,
    [name, today, time, surveyor, extra.assigned || null])).rows[0].id);
}
const MONEY = /pence|price|amount|owed|balance|earn|fee/i;
function moneyKeys(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [...(MONEY.test(k) && (typeof v === 'number' || /^\d+$/.test(String(v))) ? [`${path}.${k}`] : []), ...moneyKeys(v, `${path}.${k}`)]);
}

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_payments, notifications, todos restart identity cascade');
  today = (await pool.query(`select (now() at time zone 'Europe/London')::date::text as d`)).rows[0].d;
});
after(async () => { await pool.end(); });

async function world() {
  await person('Scott', 'scott-code', ['dampscan', 'ati-london', 'roofing', 'ac'], 'manage', true);
  const ben = await person('Ben', 'ben-code', ['dampscan', 'ati-london', 'roofing'], 'work');
  await person('Ronnie', 'ronnie-code', ['dampscan', 'ati-london'], 'work');
  const own = await survey('Bella Bens', 'ben', '09:00');
  const handed = await survey('Hana Handed', 'ronnie', '13:00', { assigned: ben });
  const ronnies = await survey('Rory Ronnies', 'ronnie', '10:00');
  const toms = await survey('Tess Toms', 'tom', '11:00');
  return { own, handed, ronnies, toms, ben: await signIn('ben-code'), boss: await signIn('scott-code') };
}

test('Ben\'s route and Today hold only his own surveys, with contacts and no money', async () => {
  const w = await world();
  const me = (await get(w.ben, '/api/admin/me')).json();
  assert.ok(me.businesses.every((b) => b.level === 'work'), 'work level everywhere');
  const route = (await get(w.ben, `/api/admin/surveys?view=day&date=${today}`)).json();
  assert.deepEqual(route.surveys.map((s) => s.name), ['Bella Bens', 'Hana Handed'], 'his own and the one handed to him, in time order');
  assert.ok(route.surveys.every((s) => s.phone), 'contacts open');
  assert.deepEqual(moneyKeys(route), [], 'no money on the route');
  const asked = (await get(w.ben, `/api/admin/surveys?view=day&date=${today}&surveyor=ronnie`)).json();
  assert.deepEqual(asked.surveys.map((s) => s.name), ['Bella Bens', 'Hana Handed'], 'asking for Ronnie\'s day changes nothing');
  const cal = (await get(w.ben, `/api/admin/calendar?view=work&from=${today}&to=${today}`)).json();
  const names = (cal.events || []).map((e) => e.name || e.customerName || e.title);
  assert.ok(!JSON.stringify(cal).includes('Rory Ronnies') && !JSON.stringify(cal).includes('Tess Toms'), 'nobody else\'s jobs on Today: ' + names.join(', '));
  assert.ok(JSON.stringify(cal).includes('Bella Bens'));
  assert.deepEqual(moneyKeys(cal), [], 'no money on Today');
});

test('Ben finds any customer with search, contacts and all, never money', async () => {
  const w = await world();
  const res = (await get(w.ben, '/api/admin/search?q=Rory')).json();
  assert.ok(JSON.stringify(res).includes('Rory Ronnies'), 'search covers every customer');
  assert.ok(JSON.stringify(res).includes('07700'), 'with the phone');
  assert.deepEqual(moneyKeys(res), []);
});

test('the company pages give Ben nothing of the company', async () => {
  const w = await world();
  for (const url of ['/api/admin/scheduling', '/api/admin/jobs?site=dampscan', '/api/admin/bank', '/api/admin/insights?site=dampscan', '/api/admin/summary', '/api/admin/leads?site=dampscan',
    '/api/admin/clients?view=all', '/api/admin/quoted?site=roofing', '/api/admin/surveys?view=board', '/api/admin/rates', '/api/admin/due', '/api/admin/people']) {
    const res = await get(w.ben, url);
    const body = res.json() || {};
    assert.equal(res.statusCode, 403, `${url} refused, got ${res.statusCode} ${Object.keys(body).join(',')}`);
  }
});

test('the owner still sees every surveyor\'s day, with the money', async () => {
  const w = await world();
  const day = (await get(w.boss, `/api/admin/surveys?view=day&date=${today}`)).json();
  assert.equal(day.surveys.length, 4);
  assert.ok(moneyKeys(day).length > 0, 'money shown to the owner');
  const bens = (await get(w.boss, `/api/admin/surveys?view=day&date=${today}&surveyor=ben`)).json();
  assert.deepEqual(bens.surveys.map((s) => s.name), ['Bella Bens']);
});
