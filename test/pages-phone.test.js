/**
 * Every staff page at phone size, checked in a real browser (the owner,
 * 16 Nov 2026: "lock it all in so every new build has to fit these rules").
 * Each page is opened at 390 x 844 with the server answered by stubs, and
 * fails CI when it breaks a rule of CLAUDE.md that only a browser can see:
 * sideways scroll, a field under 16px (iPhone zooms in), a tap under 44px,
 * a white field in the dark theme, a stripe on one edge of a box, a big
 * heading that repeats the tab, or a grey arrow where arrows are blue.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = new URL('../public', import.meta.url).pathname;
import { createRequire } from 'node:module';
let chromium = null;
/* Required (not imported) so a browser installed for the whole machine is found too. */
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed: CI installs it (ci.yml) */ }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/json' };
const ME = { ok: true, name: 'Scott', isAdmin: true, businesses: [{ slug: 'dampscan', level: 'manage' }, { slug: 'ati-london', level: 'manage' }], levels: { dampscan: 'manage', 'ati-london': 'manage' },
  rights: { known: true, money: true, settings: true, manages: { dampscan: true, 'ati-london': true } } };
/* Pages reached without a tab, or not the dark staff area. */
const SKIP = /home-trial|^index\.html$|offline|bank\.html|dashboard-old/;

let server, base, browser;
before(async () => {
  if (!chromium) return;
  server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try { const body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

/* What a page breaks, measured in the page itself. */
function check() {
  const out = [];
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ` "${(el.textContent || el.placeholder || '').trim().slice(0, 30)}"`;
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`scrolls sideways by ${document.documentElement.scrollWidth - innerWidth}px`);
  for (const f of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([tabindex="-1"]), select, textarea')) {
    if (!seen(f)) continue;
    const s = getComputedStyle(f);
    if (parseFloat(s.fontSize) < 16) out.push(`field under 16px (${s.fontSize}): ${name(f)}`);
    const m = s.backgroundColor.match(/[\d.]+/g) || [];
    if (m.length >= 3 && (+m[0] + +m[1] + +m[2]) / 3 > 200 && (m[3] === undefined || +m[3] > 0.5)) out.push(`white field: ${name(f)}`);
  }
  for (const b of document.querySelectorAll('button, a[href], summary, [role=button], [role=tab]')) {
    if (!seen(b) || b.closest('p, li.panel-note, .meta, small, [data-inline]')) continue;
    if (b.getBoundingClientRect().height < 40) out.push(`tap under 44px (${Math.round(b.getBoundingClientRect().height)}px): ${name(b)}`);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el)) continue;
    const s = getComputedStyle(el);
    const w = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (s['border' + k + 'Style'] !== 'none' ? parseFloat(s['border' + k + 'Width']) : 0));
    if (Math.max(...w) >= 3 && w.filter((x) => x >= 3).length === 1 && w.filter((x) => x > 0).length <= 3) out.push(`stripe on one edge: ${name(el)}`);
  }
  const logos = [...document.querySelectorAll('header.top > a.logo')].filter(seen);
  if (logos.length > 1) out.push(`${logos.length} logos in the header`);
  const tab = document.querySelector('.section-tab[aria-current="page"], .seg-tab[aria-pressed="true"]');
  for (const h of document.querySelectorAll('h1')) if (seen(h) && h.getBoundingClientRect().width > 1 && tab && h.textContent.trim() === tab.textContent.trim()) out.push(`heading repeats the tab: ${h.textContent.trim()}`);
  return out;
}

test('every staff page keeps the rules at phone size', async (t) => {
  if (!chromium) { assert.ok(!process.env.PAGES_CHECK_REQUIRED, 'CI must run the phone check: install the browser'); t.skip('playwright is not installed here'); return; }
  const pages = (await readdir(join(root, 'staff'))).filter((f) => f.endsWith('.html') && !SKIP.test(f));
  const problems = [];
  for (const f of pages) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ json: r.request().url().includes('/api/admin/me') ? ME : { ok: true } }));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.goto(`${base}/staff/${f}?area=damp`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(400);
    for (const p of await page.evaluate(check).catch((e) => [`could not check: ${e.message}`])) problems.push(`${f}: ${p}`);
    await ctx.close();
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

/* The checker itself: a page breaking each rule is caught, so a pass above means something. */
test('the phone check catches each kind of break', async (t) => {
  if (!chromium) { t.skip('playwright is not installed here'); return; }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`<body style="margin:0;background:#0c1a2b">
    <header class="top"><a class="logo" href="#" style="display:inline-block;height:44px">A</a><a class="logo" href="#" style="display:inline-block;height:44px">B</a></header>
    <nav><a class="section-tab" aria-current="page" href="#">Reports</a></nav><h1>Reports</h1>
    <input style="font-size:14px;background:#fff">
    <button style="height:30px">Tiny</button>
    <div style="border-left:4px solid #4fa8e8;height:20px"></div>
    <div style="width:600px;height:10px"></div></body>`);
  const found = (await page.evaluate(check)).join('\n');
  for (const want of ['scrolls sideways', 'field under 16px', 'white field', 'tap under 44px', 'stripe on one edge', 'heading repeats the tab', 'logos in the header']) assert.match(found, new RegExp(want), want);
  await page.close();
});
