/**
 * Paying yourselves (the owner, 20 Nov 2026): the dividend band, mileage at
 * 45p then 25p from the surveys driven, the seven steps and the dates.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const M = await import('../lib/mileage.js');
const S = await import('../lib/pay-self.js');

before(async () => { saved = (await pool.query('select tax_bp, lead_bp, shares from job_settings')).rows[0]; await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => {
  await pool.query('truncate jobs, paid_out, expenses restart identity cascade');
  await pool.query("update job_settings set tax_bp = 2000, lead_bp = 0, shares = '{\"scott\":4000,\"tom\":4000,\"ben\":2000}'");
});
/* Settings put back exactly as found: other test files read them. */
let saved;
after(async () => { await pool.query('update job_settings set tax_bp = $1, lead_bp = $2, shares = $3::jsonb', [saved.tax_bp, saved.lead_bp, saved.shares ? JSON.stringify(saved.shares) : null]); await pool.end(); });

test('bands, mileage rates and the tax year, worked by hand', () => {
  /* £12,570 salary and £30,000 dividends: £500 free, £29,500 at 10.75%, £7,700 of the band left. */
  const b = S.bands(1257000, 3000000);
  assert.equal(b.room, 770000);
  assert.equal(b.tax, Math.round(2950000 * 0.1075));
  assert.equal(b.over, 0);
  const over = S.bands(1257000, 4000000);
  assert.equal(over.room, 0);
  assert.equal(over.over, 230000);
  assert.equal(M.claimPence(100, 0), 4500);
  assert.equal(M.claimPence(100, 9950), 50 * 45 + 50 * 25, 'past 10,000 miles a mile is 25p');
  assert.deepEqual(M.taxYear('2026-11-20'), { from: '2026-04-06', to: '2027-04-05', label: '2026/27' });
  assert.equal(M.taxYear('2027-04-05').label, '2026/27');
  assert.equal(M.taxYear('2027-04-06').label, '2027/28');
  /* Shooter's Hill to Lewisham and back: a few miles each way. */
  const m = M.dayMiles({ lat: 51.4685, lon: 0.0730 }, [{ lat: 51.4613, lon: -0.0110 }]);
  assert.ok(m >= 6 && m <= 12, String(m));
});

test('Tom drove last month and this: last month to claim, recorded once; steps and dates follow the books', async () => {
  await pool.query("insert into postcode_geo (postcode, lat, lon) values ('SE41AA', 51.4613, -0.0110), ('ME196AB', 51.2937, 0.4104) on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon");
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const last = (() => { const d = new Date(today.slice(0, 8) + '15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  for (const [day, pc] of [[last, 'SE4 1AA'], [last, 'ME19 6AB'], [today, 'SE4 1AA']]) {
    await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, job_date, job_time, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
      values ('ati-london', 'completed', 'Kim', $2, 'full-house', 29500, 'tom', 13000, true, $1, '09:00', 2000, 0, 'scott', 'tom', 'ben')`, [day, pc]);
  }
  const tom = (await M.mileage(today)).find((p) => p.who === 'tom');
  const lastM = last.slice(0, 7);
  const lm = tom.months.find((x) => x.month === lastM);
  if (M.taxYear(last).from === M.taxYear(today).from) {
    assert.equal(lm.days, 1, 'two surveys on one day are one round trip');
    assert.ok(lm.miles > 40, 'home, Lewisham, West Malling and home again');
    assert.equal(tom.toClaim.length, 1, 'this month is not over yet');
    await pool.query("insert into expenses (spent_on, amount_pence, category, what) values ($1, $2, 'Mileage', $3)", [last, lm.pence, `Tom ${lastM}: ${lm.miles} miles`]);
    const again = (await M.mileage(today)).find((p) => p.who === 'tom');
    assert.equal(again.toClaim.length, 0);
    assert.equal(again.claimedPence, lm.pence);
  }

  await pool.query("insert into paid_out (person_key, amount_pence, paid_on, how, book) values ('scott', 104750, $1, 'Salary', 'new'), ('scott', 300000, $1, 'Dividend', 'new')", [today]);
  const v = await S.paySelf({ today });
  const scott = v.people.find((p) => p.key === 'scott');
  assert.equal(scott.salary, 104750);
  assert.equal(scott.dividends, 300000);
  assert.equal(scott.room, 5027000 - 1257000 - 300000);
  assert.equal(v.steps.length, 7);
  assert.equal(v.steps[0].done, false, 'Tom has no salary this month');
  assert.match(v.steps[0].say, /Tom/);
  assert.ok(v.milestones.some((x) => x.what === 'Last day of the tax year'));
  assert.ok(v.milestones.every((x, i, a) => !i || a[i - 1].day <= x.day), 'soonest first');
});
