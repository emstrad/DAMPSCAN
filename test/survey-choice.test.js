/**
 * Which survey on the website: asked first when the owners switch the quiz
 * on; the choice (or "not sure") is kept on the enquiry and in its history;
 * the free times are worked out with that survey's minutes on site.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'survey-choice-secret-long-enough-xxxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});
const W = await import('../lib/web-booking.js');
const H = await import('../lib/hours-store.js');
const TODAY = '2030-06-03', MON = '2030-06-10';

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate jobs, leads, surveyor_hours, surveyor_usual, surveyor_day_set, lab_flags restart identity cascade');
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('ME141AA', 51.276, 0.522) on conflict (postcode) do nothing`);
  await pool.query("insert into lab_flags (key, enabled) values ('booking_slots', true), ('survey_quiz', true)");
  await pool.query("update job_rates set duration_min = 180 where key = 'full-house'");
  await H.addHours({ personId: null }, 'ben', MON, '09:00', '13:00');
});
after(async () => { await pool.query("update job_rates set duration_min = 60 where key = 'full-house'"); await pool.query('truncate leads, surveyor_hours, lab_flags restart identity cascade'); await pool.end(); });

const lead = async () => {
  const r = (await pool.query(`insert into leads (site, stage, first_name, postcode, email, session_id) values ('dampscan', 'complete', 'Kim', 'ME14 1AA', 'k@x.com', gen_random_uuid()) returning id, session_id`)).rows[0];
  return { leadId: Number(r.id), sessionId: r.session_id };
};

test('the survey is asked first, kept on the enquiry, and a longer one gets fewer start times', async () => {
  const a = await lead();
  const first = await W.timesFor({ ...a, today: TODAY });
  assert.ok(first.days.length, 'the time comes first');
  assert.equal(first.askSurvey, true, 'then the survey');
  assert.equal(first.prices.sizes[0].damp, 215, 'with the one price list');
  await W.saveSurvey({ ...a, choice: { service: 'damp', size: 'localised', extras: [] } });
  const short = (await W.timesFor({ ...a, today: TODAY })).days.find((d) => d.date === MON).times.map((t) => t.time);
  assert.deepEqual(short, ['09:00', '10:00', '11:00', '12:00']);

  const b = await lead();
  /* Prices come from the list, never from the browser. */
  await W.saveSurvey({ ...b, choice: { service: 'damp', size: 'full-house', extras: ['camera'], price: 1 } });
  await pool.query(`update leads set survey_choice = jsonb_set(survey_choice, '{minutes}', '180') where id = $1`, [b.leadId]);
  const long = (await W.timesFor({ ...b, today: TODAY })).days.find((d) => d.date === MON).times.map((t) => t.time);
  assert.deepEqual(long, ['09:00', '10:00'], 'three hours on site (as the rate card says here) must end by 1pm');
  const row = (await pool.query('select survey_choice, sched_log from leads where id = $1', [b.leadId])).rows[0];
  assert.equal(row.survey_choice.key, 'full-house');
  assert.equal(row.survey_choice.price, 295);
  assert.match(row.sched_log[0].note, /Wants Full house damp survey \(£295\) with underfloor camera check \(£85\)/);
  const t = await lead();
  assert.equal((await W.saveSurvey({ ...t, choice: { service: 'timber', size: 'premium', extras: [] } })).chose.price, 600);
  const s = await lead();
  const alone = await W.saveSurvey({ ...s, choice: { service: 'alone', extras: ['camera', 'cavity'] } });
  assert.equal(alone.chose.price, 305, 'camera £145 and cavity £160 on their own');

  const c = await lead();
  await W.saveSurvey({ ...c, choice: { unsure: true } });
  assert.equal((await pool.query('select survey_choice from leads where id = $1', [c.leadId])).rows[0].survey_choice.unsure, true);
  assert.ok((await W.timesFor({ ...c, today: TODAY })).days.length, 'not sure still gets the usual hour');
});
