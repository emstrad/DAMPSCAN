/**
 * The clock-driven alerts: half-finished forms, overdue invoices, tomorrow's
 * diary and the Monday summary. ntfy is a stubbed fetch, and each alert is
 * checked for its words, its link, and that a rerun sends nothing twice.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.CRON_SECRET = 'a-cron-secret-that-is-long-enough';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

let pushes = [];
globalThis.fetch = async (url, init) => { pushes.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };

const { alertPartials, alertOverdue, alertDiary, diaryLine } = await import('../lib/daily-alerts.js');
const { runWeekly, weekFigures, weekLine, isLondonMonday } = await import('../lib/weekly-summary.js');
const { digestFor } = await import('../lib/digest.js');
process.env.EVENING_DIARY = 'on';
const evening = (await import('../lib/routes/cron/evening.js')).default;

const P = (pounds) => Math.round(pounds * 100);
const MONDAY = new Date('2026-10-12T06:30:00Z');

async function lead({ site = 'roofing', stage = 'partial', name = 'Sarah Jones', email = 'sarah@example.com', postcode = 'BR6 8AB', session, age = '2 hours' }) {
  const { rows } = await pool.query(
    `insert into leads (site, stage, first_name, email, postcode, session_id, created_at)
     values ($1, $2, $3, $4, $5, coalesce($6::uuid, gen_random_uuid()), now() - $7::interval) returning id, session_id`,
    [site, stage, name, email, postcode, session || null, age]);
  return rows[0];
}
async function job({ site = 'roofing', name = 'Sarah Jones', postcode = 'BR6 8AB', status = 'booked', date = null, time = null, net = 0, extra = {} }) {
  const { rows } = await pool.query(
    `insert into jobs (site, customer_name, customer_postcode, status, job_date, job_time, invoice_net_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
     values ($1, $2, $3, $4, coalesce($5::date, (now() at time zone 'Europe/London')::date), $6::time, $7, 0, 0, 'x', 'x', 'x') returning id`,
    [site, name, postcode, status, date, time, net]);
  const id = Number(rows[0].id);
  for (const [k, v] of Object.entries(extra)) await pool.query(`update jobs set ${k} = ${v} where id = $1`, [id]);
  return id;
}
const visible = (p) => `${p.title} ${p.message}`;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate leads, jobs, job_payments, notifications, todos restart identity cascade');
  pushes = [];
  process.env.NTFY_TOPIC = 'dampscan-test-topic';
});
after(async () => { await pool.end(); });

test('a half-finished form is told once, after an hour, and not when the visitor finished', async () => {
  await lead({ age: '10 minutes', email: 'fresh@example.com' });
  const done = await lead({ email: 'done@example.com' });
  await lead({ stage: 'complete', email: 'other@example.com', session: done.session_id, age: '1 hour' });
  await lead({ email: 'Back@Example.com', name: 'Dev Patel', postcode: 'DA1 1AA' });
  await lead({ stage: 'complete', email: 'back@example.com', age: '30 minutes' });
  await lead({ age: '30 days', email: 'ancient@example.com' });
  const left = await lead({});

  assert.equal(await alertPartials(), 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].title, 'Half-finished: Verge Roofing');
  assert.equal(pushes[0].message, "Sarah in BR6 started a quote but didn't finish. Tap to follow up.");
  assert.equal(pushes[0].click, 'https://dampscan.co.uk/staff/dashboard.html?area=roofing');
  assert.ok(!/jones|sarah@|8AB/i.test(visible(pushes[0])));
  const row = (await pool.query(`select kind, ref from notifications`)).rows[0];
  assert.deepEqual([row.kind, Number(row.ref)], ['lead_partial', Number(left.id)]);

  assert.equal(await alertPartials(), 0, 'once only');
  assert.equal(await alertPartials('dampscan'), 0);
});

test('an overdue invoice is told at a day past due, then not again for a week, and its words are whole pounds', async () => {
  const id = await job({ status: 'completed', net: P(5630.4), extra: { invoice_number: 7, invoiced_at: 'now()', invoice_due_on: `(now() at time zone 'Europe/London')::date - 7` } });
  await pool.query('insert into job_payments (job_id, amount_pence) values ($1, $2)', [id, P(1689)]);
  await job({ name: 'Paid Up', status: 'completed', net: P(100), extra: { invoice_number: 8, invoice_due_on: `(now() at time zone 'Europe/London')::date - 3` } });
  await pool.query('insert into job_payments (job_id, amount_pence) values (currval(\'jobs_id_seq\'), $1)', [P(100)]);
  await job({ name: 'Not Yet', status: 'completed', net: P(100), extra: { invoice_number: 9, invoice_due_on: `(now() at time zone 'Europe/London')::date` } });

  assert.equal(await alertOverdue(), 1);
  assert.equal(pushes[0].title, 'Overdue: Verge Roofing');
  assert.equal(pushes[0].message, 'Sarah, BR6 is 7 days past due on £3,941. Tap to send a reminder.');
  assert.equal(pushes[0].click, `https://dampscan.co.uk/staff/quoted.html?area=roofing#job-${id}`);
  assert.equal(await alertOverdue(), 0, 'not again the same week');

  await pool.query(`update jobs set overdue_alerted_at = now() - interval '7 days' where id = $1`, [id]);
  assert.equal(await alertOverdue(), 1, 'weekly while it stays owing');
});

test('the evening run lists tomorrow per business, timed first, once a day', async () => {
  const tomorrow = (await pool.query(`select ((now() at time zone 'Europe/London')::date + 1)::text as d`)).rows[0].d;
  await job({ name: 'Dev Smith', postcode: 'DA1 2BB', date: tomorrow, time: '14:00' });
  await job({ date: tomorrow, time: '09:30' });
  await job({ name: 'Mrs Patel', postcode: 'SE9 1AA', date: tomorrow });
  await job({ name: 'Quoted Only', date: tomorrow, status: 'quoted' });
  await job({ site: 'dampscan', name: 'Ann Lee', postcode: 'ME1 1AA', date: tomorrow, time: '10:00', extra: { surveyor: `'scott'` } });

  const noSecret = await evening({ method: 'GET', url: '/api/cron/evening', headers: {} }, { setHeader() {}, end() {} });
  assert.equal(noSecret, undefined);
  const res = { statusCode: 200, setHeader() {}, end(b) { this.body = b; } };
  await evening({ method: 'GET', url: '/api/cron/evening', headers: { authorization: 'Bearer a-cron-secret-that-is-long-enough' } }, res);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(JSON.parse(res.body).tomorrow, 2);
  const roof = pushes.find((p) => p.title === 'Tomorrow: Verge Roofing');
  assert.equal(roof.message, '9:30am Sarah, BR6. 2pm Dev, DA1. No time set: a customer in SE9.');
  assert.equal(roof.click, 'https://dampscan.co.uk/staff/calendar.html?area=roofing');
  assert.equal(pushes.find((p) => p.title === 'Tomorrow: DampScan').message, '10am Ann, ME1.');

  pushes = [];
  assert.equal(await alertDiary(1), 0, 'a business hears about a day once');
  assert.equal(pushes.length, 0);
  assert.equal(diaryLine([]), '');
});

test('the Monday summary counts the week, goes once, and only on a London Monday', async () => {
  assert.equal(isLondonMonday(MONDAY), true);
  assert.equal(isLondonMonday(new Date('2026-10-11T23:30:00Z')), true, 'Sunday night UTC is Monday in London in summer');
  assert.equal(isLondonMonday(new Date('2026-10-13T06:30:00Z')), false);

  await lead({ stage: 'complete', email: 'a@example.com' });
  await lead({ email: 'b@example.com' });
  const won = await job({ status: 'booked', net: P(1000) });
  await pool.query('insert into job_payments (job_id, amount_pence) values ($1, $2)', [won, P(500.6)]);
  await pool.query('insert into job_ratings (job_id, stars) values ($1, 5)', [won]);
  await job({ name: 'Late Payer', status: 'completed', net: P(200), extra: { invoice_number: 3, invoice_due_on: `(now() at time zone 'Europe/London')::date - 2`, created_at: `now() - interval '30 days'` } });
  await pool.query(`insert into todos (site, text) values ('roofing', 'ring the scaffolder')`);

  const f = await weekFigures({ slug: 'roofing', payout_model: 'roofing' });
  assert.deepEqual(f, { enquiries: 1, partials: 1, won: 1, moneyInPence: P(500.6), ratings: 1, ratingAvg: 5, overdue: 1, todos: 1 });
  assert.equal(weekLine(f), '1 enquiry, 1 half-finished form. 1 job won, £501 in. 1 new rating, averaging 5 stars. 1 invoice overdue. 1 open to-do.');
  assert.equal(weekLine({ enquiries: 0, partials: 0, won: 0, moneyInPence: 0, ratings: 0, overdue: 0, todos: 0 }), null);

  assert.equal(await runWeekly(new Date('2026-10-13T06:30:00Z')), 0, 'not on a Tuesday');
  /* ATi and DampScan get one Monday briefing between them (lib/company-week.js), not a line each. */
  assert.equal(await runWeekly(MONDAY), 2, 'Verge had a week to speak of, and the damp brands their briefing');
  const verge = pushes.find((p) => p.title === 'Last week: Verge Roofing'), brief = pushes.find((p) => p.title === 'Monday briefing');
  assert.ok(verge && brief);
  assert.ok(!pushes.some((p) => /Last week: (DampScan|ATi)/.test(p.title)), 'no second line for a damp brand');
  assert.match(brief.click, /\/staff\/company\.html#week$/);
  for (const p of [verge, brief]) assert.ok(!/sarah|late payer|scaffolder/i.test(visible(p)), 'counts only');
  assert.equal(await runWeekly(MONDAY), 0, 'once per Monday');
});

test('the morning digest does not count the scheduled alerts again', async () => {
  await lead({});
  await alertPartials();
  const lines = await digestFor({ slug: 'roofing', name: 'Verge Roofing', payout_model: 'roofing' });
  assert.ok(!lines.some((l) => /Since the last digest/.test(l)), lines.join(' '));
});
