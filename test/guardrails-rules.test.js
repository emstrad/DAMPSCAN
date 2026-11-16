/**
 * More of CLAUDE.md made mechanical (the owner, 16 Nov 2026: "lock it all in
 * so every new build has to fit these rules"). Each test names the rule it
 * guards; a new page or feature that breaks one fails CI with the reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SYSTEM } from '../lib/todo-sweep.js';

const root = new URL('..', import.meta.url).pathname;
async function files(dir, pick) {
  const out = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'generated'].includes(e.name)) out.push(...await files(p, pick)); } else if (pick(p)) out.push(p);
  }
  return out;
}
const read = (f) => readFile(join(root, f), 'utf8');

test('free-text matching never stops at a full stop (an amount like £357.50 broke the deposit chase)', async () => {
  for (const f of await files('lib', (p) => p.endsWith('.js')).then(async (l) => l.concat(await files('public', (p) => p.endsWith('.js'))))) {
    assert.ok(!(await read(f)).includes('[^.]*'), `${f}: "[^.]*" ends at the point in £1.50; use (?:[^.]|\\.\\d)*`);
  }
});

/* Every way the system makes a to-do is known to lib/todo-sweep.js, so it closes itself once done.
   A person's own (lib/todos.js) and a surveyor's report check (named after them) wait for a person. */
test('every to-do the system makes can close itself (lib/todo-sweep.js knows who set it)', async () => {
  const PERSON = ['lib/todos.js'];
  for (const f of await files('lib', (p) => p.endsWith('.js'))) {
    const text = await read(f);
    if (!/insert into todos/.test(text) || PERSON.includes(f)) continue;
    for (const m of text.matchAll(/insert into todos[\s\S]{0,400}?\)\s*(?:values|select)\s*([\s\S]{0,300}?)(?:\)|from|where)/g)) {
      const names = [...m[1].matchAll(/'([A-Z][A-Za-z ]+)'/g)].map((x) => x[1]).filter((n) => n !== 'manual');
      assert.ok(names.length, `${f}: a to-do with no fixed set_by_name; the sweep cannot tell it is the system's`);
      for (const n of names) assert.ok(SYSTEM.includes(n), `${f}: to-dos set by "${n}" are not in SYSTEM in lib/todo-sweep.js, so they would pile up`);
    }
  }
});

test('section tabs are underline tabs and Company\'s tabs are the sliding switch', async () => {
  const area = await read('public/staff/area.css');
  assert.match(area, /\.section-tabs\{[^}]*flex-wrap:nowrap/, 'section tabs stay on one line');
  assert.ok(!/\.section-tab[^{]*\{[^}]*border-radius:999px/.test(area), 'section tabs are never pills');
  for (const f of await files('public/staff', (p) => p.endsWith('.html'))) {
    const html = await read(f);
    if (/co-tabs|company-hub\.js/.test(html)) assert.match(html, /\/staff\/seg-tabs\.js/, `${f}: Company's tab row without the sliding switch`);
  }
});

/* A page its tab already names shows no second heading. Pages reached without a tab keep theirs. */
test('no page repeats its tab as a big heading', async () => {
  const OWN = ['public/staff/settings.html', 'public/staff/texts.html', 'public/staff/week.html', 'public/staff/index.html', 'public/staff/due.html'];
  for (const f of await files('public/staff', (p) => p.endsWith('.html') && !/home-trial/.test(p))) {
    if (OWN.includes(f)) continue;
    const h = (await read(f)).match(/<h1([^>]*)>/);
    if (h) assert.match(h[1], /sr-only|tab-h1/, `${f}: a visible h1 under the tab that already names the page`);
  }
});

test('no field is a white box in the dark staff area (the login page keeps its light brand)', async () => {
  for (const f of await files('public/staff', (p) => p.endsWith('.css'))) {
    const css = await read(f);
    for (const m of css.matchAll(/([^{}]*(?:textarea|input|select)[^{}]*)\{[^}]*background(?:-color)?:\s*(#fff\b|#ffffff\b|white\b)/gi)) {
      if (!/login|data-theme="light"/.test(m[1])) assert.fail(`${f}: a white field "${m[0].trim().slice(0, 80)}"`);
    }
  }
});

/* No shouting (the owner's calm screens): uppercase only on the logo, the small c-label, table heads and the few tiny figure labels. */
test('no new uppercase labels or headings on staff screens', async () => {
  const OK = /logo-word|logo-tag|\.c-label|^th$|\.cal-dow|\.tile \.k|\.preview-cell \.k/;
  for (const f of await files('public/staff', (p) => p.endsWith('.css'))) {
    const css = await read(f);
    for (const m of css.matchAll(/([^{}]+)\{[^}]*text-transform:\s*uppercase/g)) {
      const sel = m[1].trim().split('\n').pop().trim();
      if (OK.test(sel)) continue;
      assert.fail(
        `${f}: "${sel}" shouts in capitals; use sentence case (or .c-label for a small label)`);
    }
  }
});
