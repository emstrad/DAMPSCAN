/**
 * A person at 'work' level on a business does the work and never sees what
 * it is worth: no prices, deposits, balances, fees, pay or profit on any
 * screen or API a surveyor or crew member uses. Each route is called as such
 * a person against jobs that do carry money, and every number on a key that
 * names money must be absent.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'work-figures-test-secret-long-enough-x';
process.env.IP_SALT = 'work-figures-test-salt';
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
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.7', 'user-agent': 't', ...headers }, socket: { remoteAddress: '203.0.113.7' } };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, write(c) { this.body = (this.body || '') + c; }, end(p) { if (p) this.body = (this.body || '') + p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const req = makeReq(init); const res = makeRes(); await handler(req, res); return res; }
async function person(name, code, grants, { isAdmin = false, level = 'work' } = {}) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash, is_admin) values ($1,$2,$3) returning id', [name, h, isAdmin]);
  for (const g of grants) await pool.query('insert into grants (person_id, business_slug, level) values ($1,$2,$3)', [rows[0].id, g, level]);
  const raw = (await call(login, { method: 'POST', url: '/api/auth/login', body: { code } })).getHeader('set-cookie');
  return { id: Number(rows[0].id), cookie: (Array.isArray(raw) ? raw.join('; ') : String(raw)).split(';')[0] };
}
const api = (who, method, url, body) => call(dispatch, { method, url, body, headers: { cookie: who.cookie } });

/* A key that names money, holding a number above nothing. */
const MONEY = /pence|price|amount|owed|balance|profit|fee|earn|invoice|cost|deposit(?!PaidAt|_paid_at)|^pay$|^pay_|takings|turnover|revenue|income/i;
export function moneyIn(value, path = '') {
  const found = [];
  if (Array.isArray(value)) value.forEach((v, i) => found.push(...moneyIn(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      if (MONEY.test(k) && ((typeof v === 'number' && v > 0) || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0) || (v && typeof v === 'object' && moneyIn(v).length === 0 && JSON.stringify(v).match(/[1-9]/)))) found.push(p);
      else found.push(...moneyIn(v, p));
    }
  }
  return found;
}

let admin; let ronnie; let D;
before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate leads, events, rate_hits, jobs, people, audit, todos, job_payments, job_costs, payouts restart identity cascade');
  D = (await pool.query(`select d::text as today, (d + 1)::text as tomorrow from (select (now() at time zone 'Europe/London')::date as d) x`)).rows[0];
  admin = await person('Owner', 'own-code-1', ['dampscan', 'ati-london', 'roofing'], { isAdmin: true, level: 'manage' });
  ronnie = await person('Ronnie', 'ron-code-1', ['dampscan', 'ati-london', 'roofing']);
  const booked = (await api(admin, 'POST', '/api/admin/jobs', { site: 'dampscan', surveyType: 'localised', surveyor: 'ronnie', customerName: 'Sam Lee', customerPostcode: 'ME14 2AB', customerPhone: '07700 900222', jobDate: D.today, jobTime: '10:00', surveyPricePence: 21500 })).json();
  assert.equal(booked.ok, true, JSON.stringify(booked));
  await api(admin, 'POST', '/api/admin/jobs', { site: 'ati-london', surveyType: 'localised', surveyor: 'ben', customerName: 'Ann Bell', customerPostcode: 'SE1 1AA', jobDate: D.tomorrow, surveyPricePence: 30000 });
  const roof = (await pool.query(`insert into jobs (site, status, invoice_net_pence, customer_name, customer_postcode, job_date, date_set, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('roofing', 'booked', 450000, 'Roy Tile', 'BR6 0AA', $1, true, 0, 0, '', '', '') returning id`, [D.today])).rows[0].id;
  await pool.query(`insert into job_payments (job_id, amount_pence, paid_on, label) values ($1, 100000, $2, 'deposit')`, [roof, D.today]);
  await pool.query(`insert into job_costs (job_id, kind, description, amount_pence) values ($1, 'materials', 'Slates', 80000)`, [roof]).catch(() => {});
});
after(async () => { await pool.end(); });

const ROUTES = [
  '/api/admin/calendar?area=damp&view=work&from=TODAY&to=TOMORROW',
  '/api/admin/calendar?view=work&from=TODAY&to=TOMORROW',
  '/api/admin/calendar?view=job&id=1', '/api/admin/calendar?view=job&id=3',
  '/api/admin/surveys?area=damp', '/api/admin/surveys?view=day&date=TODAY', '/api/admin/surveys?view=day&date=TODAY&surveyor=ronnie',
  '/api/admin/clients?view=all', '/api/admin/jobs?range=all', '/api/admin/due', '/api/admin/insights', '/api/admin/search?q=Lee', '/api/admin/search?q=Tile',
  '/api/admin/roofing?view=board', '/api/admin/roofing?view=week&from=TODAY', '/api/admin/roofing?view=job&id=3',
  '/api/admin/quoted?range=all', '/api/admin/summary?range=all', '/api/admin/people', '/api/admin/me', '/api/admin/todos'
];

for (const path of ROUTES) {
  test(`work level sees no figures: ${path}`, async () => {
    const url = path.replace(/TODAY/g, D.today).replace(/TOMORROW/g, D.tomorrow);
    const res = await api(ronnie, 'GET', url);
    if (res.statusCode !== 200) return; /* refused outright is hidden too */
    assert.deepEqual(moneyIn(res.json()), [], url);
  });
}

test('the money pages refuse a work level person', async () => {
  for (const url of ['/api/admin/bank', '/api/admin/rates']) {
    const res = await api(ronnie, 'GET', url);
    assert.equal(res.statusCode, 403, url);
  }
});

test('the owner still sees the figures the work person does not', async () => {
  const jobs = (await api(admin, 'GET', '/api/admin/jobs?range=all')).json();
  assert.ok(moneyIn(jobs).length > 0);
  const ron = jobs.jobs.find((j) => j.surveyor === 'ronnie');
  assert.ok(ron, 'Ronnie is a surveyor');
});

test('the work is still there: the day sheet and Today show the survey and no amounts; the company board is refused', async () => {
  assert.equal((await api(ronnie, 'GET', '/api/admin/surveys?area=damp')).statusCode, 403, 'the survey board is the company\'s');
  const day = (await api(ronnie, 'GET', `/api/admin/surveys?view=day&date=${D.today}&surveyor=ronnie`)).json();
  assert.equal(day.surveys.length, 1);
  assert.equal(day.surveys[0].surveyor, 'ronnie');
  assert.equal(day.surveys[0].pricePence, undefined);
  const cal = (await api(ronnie, 'GET', `/api/admin/calendar?view=work&from=${D.today}&to=${D.tomorrow}`)).json();
  assert.ok(JSON.stringify(cal).includes('Sam'), 'Today lists the visit');
});

test('assistant tools hide the same figures, including get_job on a damp survey', async () => {
  const { TOOLS } = await import('../lib/mcp/tools.js');
  const { scopeFor } = await import('../lib/access.js');
  const scope = await scopeFor({ person: true, sub: ronnie.id });
  const getJob = TOOLS.find((t) => t.name === 'get_job');
  const out = await getJob.run(scope, { id: 1 });
  assert.equal(out.status, 200);
  assert.deepEqual(moneyIn(out.data), []);
  const list = await TOOLS.find((t) => t.name === 'list_survey_jobs').run(scope, { range: 'all' });
  assert.deepEqual(moneyIn(list.data), []);
});
