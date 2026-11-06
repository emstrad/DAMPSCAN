/* The route a surveyor sees on their phone (lib/day-route.js). */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan', max: 2 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const { query } = await import('../lib/db.js');
const { withDrives } = await import('../lib/day-route.js');

before(async () => { if (HAS_DB) await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
after(async () => { await pool.end(); });

test('a surveyor\'s route counts the drive from home, between surveys and home again', { skip: !HAS_DB }, async () => {
  await query(`insert into postcode_geo (postcode, lat, lon) values ('ME194AA', 51.29, 0.41), ('ME145AA', 51.27, 0.52) on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
  const out = await withDrives([
    { id: -1, surveyor: 'ben', time: '09:00', postcode: 'ME19 4AA' },
    { id: -2, surveyor: 'ben', time: '11:00', postcode: 'ME14 5AA' }
  ]);
  assert.equal(out.surveys[0].fromHome, true);
  assert.ok(out.surveys[0].driveMin > 0);
  assert.ok(out.surveys[1].driveMin > 0);
  assert.equal(out.surveys[1].fromHome, false);
  assert.match(out.homeBy, /^12:\d\d$/);
});

test('several surveyors mixed together get no drives', { skip: !HAS_DB }, async () => {
  const out = await withDrives([{ id: -1, surveyor: 'ben', time: '09:00', postcode: 'ME19 4AA' }, { id: -2, surveyor: 'tom', time: '10:00', postcode: 'SE18 3AA' }]);
  assert.equal(out.homeBy, null);
  assert.equal(out.surveys[0].driveMin, undefined);
});
