/**
 * Quick book on the estate agent's page, clicked through in a real browser at
 * phone size against the real routes (the owner, 27 Nov 2026: "are we sure
 * Quick book works?"): the property, the buyer, who lets us in, a size and a
 * time booked; the same buyer again shown their survey instead of a second
 * one; and a day after the visit, "Book another visit here" with the property
 * filled in. Any error in the page fails it.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'agent-e2e-secret-long-enough-xxxxxxxxxx', IP_SALT: 'agent-e2e-salt-long-enough' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' });
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* CI installs it */ }

const lead = (await import('../api/lead.js')).default;
const quote = (await import('../api/quote.js')).default;
const root = new URL('../public', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const TOKEN = 'agent_e2e_token_00000000000000001';
let server, base, browser;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, surveyor_hours, estate_agents, portal_events, drive_times restart identity cascade');
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time)
    select s, d::date, '09:00', '17:00' from unnest(array['tom','ben','ronnie']) s, generate_series(current_date, current_date + 30, '1 day') d where extract(isodow from d) < 6`);
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('W129NE', 51.507, -0.236), ('SE41PE', 51.469, -0.03) on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
  await pool.query(`insert into lab_flags (key, enabled) values ('booking_slots', true), ('survey_quiz', true), ('instant_booking', true) on conflict (key) do update set enabled = true`);
  await pool.query(`insert into estate_agents (name, site, phone, portal_token) values ('CA Services', 'ati-london', '02087400000', $1)`, [TOKEN]);
  if (!chromium) return;
  server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); req.query = Object.fromEntries(u.searchParams);
    if (u.pathname === '/api/lead') return lead(req, res);
    if (u.pathname === '/api/quote') return quote(req, res);
    if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    const p = u.pathname.startsWith('/a/') ? '/agent.html' : decodeURIComponent(u.pathname);
    try { const body = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); await pool.end(); });

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London' });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(`${base}/a/${TOKEN}`); await p.waitForSelector('.ag-book');
  return p;
}
const sheet = async (p) => (await p.innerText('.ag-sheet')).replace(/\s+/g, ' ');
/* The property (unless filled in already), the buyer, then who lets us in. */
async function details(p, buyer, property) {
  if (property) { await p.fill('#ag-address', property.address); await p.fill('#ag-town', 'London'); await p.fill('#ag-postcode', property.postcode); }
  await p.click('.ag-sheet .pt-btn');
  await p.fill('#ag-name', buyer.name); await p.fill('#ag-phone', buyer.phone); await p.fill('#ag-email', buyer.email);
  await p.click('.ag-sheet .pt-btn');
  await p.click('.ag-sheet button:has-text("We have the keys")');
  await p.click('.ag-sheet .pt-btn:not(.ghost)');
  await p.waitForFunction(() => /The survey|Already booked/.test(document.querySelector('.ag-sheet').innerText), null, { timeout: 10000 });
}
async function sizeAndTime(p) {
  await p.click('.ag-sheet .ag-size >> nth=1');
  await p.waitForSelector('.ag-sheet .pt-times button', { timeout: 15000 });
  await p.click('.ag-sheet .pt-times button >> nth=0');
  await p.waitForFunction(() => /Booked/.test(document.querySelector('.ag-sheet h2').textContent), null, { timeout: 15000 });
}
const SAM = { name: 'sam patel', phone: '07700 900456', email: 'sam@example.com' };

test('Quick book: booked, the same buyer again is shown their survey, and another visit a day after', { skip: !chromium && 'no browser' }, async () => {
  const p = await page();
  await p.click('.ag-book'); await p.waitForSelector('.ag-sheet.open');
  await details(p, SAM, { address: '12 Askew Road', postcode: 'w12 9ne' });
  await sizeAndTime(p);
  assert.match(await sheet(p), /Sam gets a text with their page and the deposit link/, 'the name tidied');
  const job = (await pool.query(`select id, customer_name, survey_type, agent_access, estate_agent_id from jobs`)).rows;
  assert.equal(job.length, 1);
  assert.deepEqual([job[0].customer_name, job[0].survey_type, job[0].agent_access], ['Sam Patel', 'full-house', 'agent']);
  await p.click('.ag-sheet .pt-btn');

  /* The same buyer again: their survey, no second enquiry or booking. */
  await p.click('.ag-book'); await p.waitForSelector('.ag-sheet.open');
  await details(p, { ...SAM, name: 'Sam Patel' }, { address: '12 Askew Road', postcode: 'W12 9NE' });
  assert.match(await sheet(p), /Already booked.*Sam Patel is already booked here for/);
  assert.equal((await pool.query('select count(*)::int as n from leads')).rows[0].n, 1);
  await p.click('.ag-sheet .pt-btn');

  /* Three days on, the visit is over: another visit here, the property filled in. */
  await pool.query('update jobs set job_date = current_date - 3 where id = $1', [job[0].id]);
  const q = await page();
  await q.click('text=Book another visit here'); await q.waitForSelector('.ag-sheet.open');
  assert.deepEqual([await q.inputValue('#ag-address'), await q.inputValue('#ag-town'), await q.inputValue('#ag-postcode')], ['12 Askew Road', 'London', 'W12 9NE']);
  await details(q, { name: 'Lou Fox', phone: '07700900999', email: 'lou@example.com' });
  await sizeAndTime(q);
  assert.equal((await pool.query(`select count(*)::int as n from jobs where customer_postcode = 'W12 9NE'`)).rows[0].n, 2);
  assert.deepEqual(p.errors.concat(q.errors), []);
});
