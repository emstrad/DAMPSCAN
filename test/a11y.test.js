/**
 * Accessibility, the parts that are checkable without a browser.
 *
 * A full audit needs axe in real Chromium, which is not something the repo
 * suite runs. What it can do is hold the structural decisions that audit
 * produced, so they cannot quietly regress: the landmarks, the skip link, the
 * heading order and the focus indicator on the form.
 *
 * Every rule here comes from a violation that was actually found and fixed, not
 * from a checklist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = new URL('../public/', import.meta.url).pathname;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

/* The staff area is behind a login and noindex, and is audited separately. */
const PAGES = htmlFiles(PUBLIC)
  .filter((p) => !p.slice(PUBLIC.length).startsWith('staff/'))
  .map((path) => ({ path: path.slice(PUBLIC.length), html: readFileSync(path, 'utf8') }));

const noScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '');

test('every page has exactly one main landmark, and it is the skip target', () => {
  for (const { path, html } of PAGES) {
    const mains = html.match(/<main[^>]*>/g) || [];
    assert.equal(mains.length, 1, `${path} has ${mains.length} main elements`);
    assert.match(mains[0], /id="main"/, `${path}: main is not the skip target`);
  }
});

test('every page opens with a skip link pointing at that main', () => {
  for (const { path, html } of PAGES) {
    const body = html.slice(html.indexOf('<body'));
    assert.match(body, /<a class="skip-link" href="#main">/, `${path} has no skip link`);
    const skipAt = body.indexOf('class="skip-link"');
    const headerAt = body.search(/<header/);
    assert.ok(skipAt < headerAt, `${path}: the skip link comes after the header, so tabbing reaches it too late`);
  }
});

/* role="group" is not a landmark, so the fixed bar sat outside every region
   and its content was unreachable by landmark navigation. */
test('the mobile action bar is a landmark, not a bare div', () => {
  for (const { path, html } of PAGES) {
    if (!html.includes('action-bar')) continue;
    assert.match(html, /<nav class="action-bar" aria-label="Quick actions">/, `${path}: action bar is not a nav`);
    assert.ok(!html.includes('<div class="action-bar"'), `${path}: action bar is still a div`);
  }
});

test('heading levels never skip a step', () => {
  for (const { path, html } of PAGES) {
    const levels = [...noScripts(html).matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    assert.ok(levels.length, `${path} has no headings at all`);
    assert.equal(levels[0], 1, `${path} does not start at h1`);
    assert.equal(levels.filter((l) => l === 1).length, 1, `${path} has more than one h1`);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i] <= levels[i - 1] + 1,
        `${path}: h${levels[i - 1]} is followed by h${levels[i]}, which skips a level`);
    }
  }
});

/* The form fields had outline:none on :focus with only a border colour change
   in its place, which is a colour difference and nothing else. */
test('no stylesheet removes the focus outline without replacing it', () => {
  for (const name of ['book.css', 'area.css']) {
    const css = readFileSync(join(PUBLIC, 'assets', name), 'utf8');
    const kills = [...css.matchAll(/([^{}]*):focus[^{}]*\{[^}]*outline:\s*none/g)];
    assert.deepEqual(kills.map((m) => m[1].trim()), [],
      `${name} removes the focus outline on ${kills.map((m) => m[1].trim()).join(', ')}`);
    assert.match(css, /:focus-visible[^{]*\{[^}]*outline:\s*\d/, `${name} defines no focus ring`);
  }
});

test('motion respects the reduced motion preference', () => {
  for (const name of ['index.html', 'london.html']) {
    const html = readFileSync(join(PUBLIC, name), 'utf8');
    if (!html.includes('carousel-track')) continue;
    assert.match(html, /@media \(prefers-reduced-motion:\s*reduce\)/,
      `${name} animates a carousel with no reduced motion rule`);
  }
});
