/**
 * The rules in CLAUDE.md that a machine can check, so drift fails CI rather
 * than reaching the live site.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

async function files(dir, pick) {
  const out = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'generated'].includes(e.name)) out.push(...await files(p, pick)); } else if (pick(p)) out.push(p);
  }
  return out;
}

test('at most 12 serverless functions under api/ (Vercel Hobby)', async () => {
  const fns = await files('api', (p) => p.endsWith('.js'));
  assert.ok(fns.length <= 12, `${fns.length} functions: ${fns.join(', ')}`);
});

test('code files stay under 300 lines', async () => {
  const code = [...await files('lib', (p) => p.endsWith('.js')), ...await files('api', (p) => p.endsWith('.js')),
    ...await files('public/staff', (p) => /\.(js|html|css)$/.test(p) && !p.endsWith('staff.css'))];
  const long = [];
  for (const f of code) {
    const n = (await readFile(join(root, f), 'utf8')).replace(/\n$/, '').split('\n').length;
    if (n > 300) long.push(`${f} (${n})`);
  }
  assert.deepEqual(long, []);
});

test('no keys or tokens committed', async () => {
  const code = [...await files('lib', (p) => p.endsWith('.js')), ...await files('api', (p) => p.endsWith('.js')), ...await files('public', (p) => /\.(js|html)$/.test(p))];
  const KEY = /\b(re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}|sk_live_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  const hits = [];
  for (const f of code) if ((await stat(join(root, f))).size < 2e6 && KEY.test(await readFile(join(root, f), 'utf8'))) hits.push(f);
  assert.deepEqual(hits, []);
});

test('every schema statement that creates or alters is guarded to run twice', async () => {
  const sql = (await readFile(join(root, 'db/schema.sql'), 'utf8')).replace(/--.*$/gm, '');
  const bad = sql.split(';').map((s) => s.trim()).filter((s) =>
    (/^create (table|index|unique index)/i.test(s) && !/if not exists/i.test(s)) || (/^alter table .* add column/i.test(s) && !/if not exists/i.test(s)));
  assert.deepEqual(bad.map((s) => s.slice(0, 80)), []);
});

test('Surveymate is never written to and change alerts never say who via ChatGPT', async () => {
  const lib = await files('lib', (p) => p.endsWith('.js'));
  const text = (await Promise.all(lib.map((f) => readFile(join(root, f), 'utf8')))).join('\n');
  assert.ok(!/surveymate\.[a-z]/i.test(text), 'no Surveymate address in code');
  const activity = await readFile(join(root, 'lib/activity.js'), 'utf8');
  assert.ok(!/via ChatGPT\)/.test(activity), 'change alerts say what happened, not who via what');
});

/* The locked-in build (CLAUDE.md, "How every page is built"): shared motion
   and fit on every page, hidden stays hidden, and no explaining paragraphs. */
test('every page loads the shared motion and fit, and hidden stays hidden', async () => {
  for (const css of ['public/assets/header.css', 'public/staff/shell.css']) {
    const s = await readFile(join(root, css), 'utf8');
    assert.match(s, /@import url\("\/assets\/motion\.css"\)/, css);
    assert.match(s, /@import url\("\/assets\/fit\.css"\)/, css);
  }
  assert.match(await readFile(join(root, 'public/assets/fit.css'), 'utf8'), /\[hidden\]\{display:none!important\}/);
});

test('staff pages carry no explaining paragraphs under their headings', async () => {
  /* The few kept say where a setting lives or warn before a change; a new one needs the owner's yes and this number raised. */
  const KEPT = 4;
  let plain = 0;
  for (const f of await files('public/staff', (p) => p.endsWith('.html'))) {
    const html = await readFile(join(root, f), 'utf8');
    assert.ok(!/<h1[^>]*>[^<]*<\/h1>\s*<p class="panel-note">/.test(html), `${f} opens with an explaining paragraph`);
    for (const m of html.matchAll(/<p class="panel-note">([\s\S]*?)<\/p>/g)) if (!/<(a|button|code)\b/.test(m[1])) plain += 1;
  }
  assert.ok(plain <= KEPT, `${plain} explaining paragraphs on staff pages (at most ${KEPT})`);
});

/* The owner's hard no: a coloured stripe along one edge of a card. */
test('no card has a coloured stripe on one edge', async () => {
  for (const f of await files('public', (p) => /\.(css|html|js)$/.test(p))) {
    const text = await readFile(join(root, f), 'utf8');
    for (const m of text.matchAll(/border-(top|left|right|bottom)(-width)?\s*:\s*([3-9]|\d\d)px[^;}]*/g)) {
      assert.ok(/transparent/.test(m[0]), `${f}: "${m[0]}" is an edge stripe`);
    }
  }
});
