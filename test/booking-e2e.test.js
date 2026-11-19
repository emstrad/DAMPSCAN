/**
 * Booking a customer, clicked through in a real browser at phone size against
 * the real staff routes (the owner, 19 Nov 2026: Book it on an unbooked
 * survey's card did nothing and no test pressed it). A new caller to their
 * customer card, a time tapped and cancelled back to the card, booked from it
 * to the survey's card; an unbooked survey booked from its own card; the
 * phone's back closing what is on top. Any error in the page fails it.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
Object.assign(process.env, { SESSION_SECRET: 'e2e-secret-long-enough-xxxxxxxxxxxxxxxx', IP_SALT: 'e2e-salt-long-enough' });
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* CI installs it */ }

const admin = (await import('../api/admin/[action].js')).default;
const { signSession, COOKIE_NAME } = await import('../lib/session.js');
const root = new URL('../public', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/json' };
let server, base, browser;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query('truncate jobs, leads, todos, notifications, sms_outbox, surveyor_hours, audit, drive_times restart identity cascade');
  await pool.query(`insert into surveyor_hours (surveyor, on_date, start_time, end_time)
    select s, d::date, '09:00', '17:00' from unnest(array['tom','ben','ronnie']) s, generate_series(current_date, current_date + 21, '1 day') d where extract(isodow from d) < 6`);
  await pool.query(`insert into postcode_geo (postcode, lat, lon) values ('ME194AA', 51.29, 0.41), ('CT119LS', 51.335, 1.41), ('SE41PE', 51.469, -0.03)
    on conflict (postcode) do update set lat = excluded.lat, lon = excluded.lon`);
  await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_phone, customer_address, survey_type, survey_price_pence, surveyor, surveyor_fee_pence, date_set, tax_bp, lead_bp, lead_earner, partner_a, partner_b)
    values ('dampscan', 'booked', 'Alex Krutnik', 'CT11 9LS', '07969112229', '63 Vale Road, Ramsgate', 'dt-full-house', 44500, 'ben', 13000, false, 2000, 1500, 'scott', 'tom', 'ben')`);
  if (!chromium) return;
  server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    req.query = Object.fromEntries(u.searchParams);
    if (u.pathname.startsWith('/api/admin/')) { req.query.action = u.pathname.split('/')[3]; return admin(req, res); }
    if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    try { const p = decodeURIComponent(u.pathname); const body = await readFile(join(root, p.endsWith('/') ? p + 'index.html' : p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); await pool.end(); });

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London' });
  const n = Math.floor(Date.now() / 1000);
  await ctx.addCookies([{ name: COOKIE_NAME, value: signSession({ sub: 0, name: 'Owners', role: 'admin', person: false, jti: 'e2e', iat: n, exp: n + 3600 }), url: base }]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  return p;
}
const top = (p) => p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')]; return d.length ? d[d.length - 1].innerText : ''; });

test('a caller: added, a time tapped and cancelled back to their card, then booked to the survey\'s card; back closes it', { skip: !chromium && 'no browser' }, async () => {
  const p = await page();
  await p.goto(base + '/staff/schedule.html?area=damp'); await p.waitForSelector('#newc-open');
  await p.click('#newc-open'); await p.fill('#nc-name', 'Jo Kent'); await p.fill('#nc-phone', '07700 900123'); await p.fill('#nc-postcode', 'me194aa');
  await p.click('#newc-form button[type=submit]');
  await p.waitForFunction(() => /Jo Kent/.test([...document.querySelectorAll('dialog[open]')].map((d) => d.innerText).join('')));
  assert.match(await top(p), /DampScan/, 'the brand from the postcode');
  await p.click('dialog[open] .scc-time >> nth=0'); await p.waitForSelector('#book[open]');
  await p.click('#b-cancel'); await p.waitForTimeout(300);
  assert.match(await top(p), /Jo Kent/, 'Cancel goes back to their card');
  await p.click('dialog[open] .scc-time >> nth=0'); await p.selectOption('#b-type', 'full-house'); await p.click('#b-go');
  await p.waitForFunction(() => /Deposit to collect/.test([...document.querySelectorAll('dialog[open]')].map((d) => d.innerText).join('')), null, { timeout: 10000 });
  const job = (await pool.query(`select date_set, status from jobs where customer_name = 'Jo Kent'`)).rows[0];
  assert.deepEqual([job.date_set, job.status], [true, 'booked']);
  await p.goBack(); await p.waitForTimeout(300);
  assert.equal(await top(p), '', 'back closes the card');
  assert.match(p.url(), /schedule\.html/, 'and stays on Scheduling');
  assert.deepEqual(p.errors, []);
});

test('an unbooked survey books from its own card', { skip: !chromium && 'no browser' }, async () => {
  const p = await page();
  await p.goto(base + '/staff/calendar.html'); await p.waitForFunction(() => window.DSPOP);
  const id = Number((await pool.query(`select id from jobs where customer_name = 'Alex Krutnik'`)).rows[0].id);
  await p.evaluate((x) => window.DSPOP.open(x, {}), id);
  await p.waitForSelector('dialog[open] form.sheet-row');
  await p.evaluate(() => document.querySelectorAll('dialog[open] details').forEach((d) => { d.open = true; }));
  const day = new Date(Date.now() + 5 * 86400000); while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  await p.$eval('dialog[open] form.sheet-row input[type=date]', (x, v) => { x.value = v; }, day.toISOString().slice(0, 10));
  await p.$eval('dialog[open] form.sheet-row input[type=time]', (x) => { x.value = '11:00'; });
  await p.selectOption('dialog[open] form.sheet-row select', 'ben');
  p.on('dialog', (d) => d.accept());
  await p.click('dialog[open] form.sheet-row button[type=submit]');
  await p.waitForFunction(() => /Deposit to collect/.test(document.querySelector('dialog[open]').innerText), null, { timeout: 10000 });
  const j = (await pool.query('select date_set, to_char(job_time, \'HH24:MI\') as t from jobs where id = $1', [id])).rows[0];
  assert.deepEqual([j.date_set, j.t], [true, '11:00']);
  assert.deepEqual(p.errors, []);
});
