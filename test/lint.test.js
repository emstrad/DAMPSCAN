/**
 * The code itself, read for the slips no page test clicks into (the owner,
 * 19 Nov 2026: Book it on an unbooked survey's card did nothing for a week).
 * A name used before it is set in the same function (a later `var` hides the
 * one above, as `who` hid the surveyor picker), a name that does not exist
 * (a stray `e` in the booking form's Cancel), and the plain mistakes:
 * duplicate keys, unreachable code, a constant reassigned, a typeof typo.
 * Every staff page script, the websites' scripts, the server and the build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { ESLint } = createRequire(import.meta.url)('eslint');

const RULES = {
  'no-undef': 'error',
  /* The shared names above are where one script hands to the next, so visit.js setting them is fine. */
  'no-redeclare': ['error', { builtinGlobals: false }],
  /* Only a use in the same function before the line that sets it: a closure that runs later is fine. */
  'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
  'no-dupe-keys': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error',
  'no-unreachable': 'error', 'no-const-assign': 'error', 'no-func-assign': 'error',
  'no-self-assign': 'error', 'no-unsafe-negation': 'error', 'use-isnan': 'error', 'valid-typeof': 'error'
};
/* What one page script leaves on window for the next (ui.js's DSUI, the sites' DS, track and endpoints). */
const SHARED = ['DSUI', 'DS', 'DS_CFG', 'track', 'NOTIFY_ENDPOINT', 'LEAD_ENDPOINT', 'DSLEADS', 'DSLEADACTS']
  .reduce((o, k) => Object.assign(o, { [k]: 'readonly' }), {});

async function problems(files, config) {
  const eslint = new ESLint({ useEslintrc: false, overrideConfig: config, errorOnUnmatchedPattern: false });
  const out = await eslint.lintFiles(files);
  return out.flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => `${f.filePath.replace(process.cwd() + '/', '')}:${m.line} ${m.message} (${m.ruleId})`));
}

test('page scripts: no name used before it is set, none that does not exist', async () => {
  const found = await problems(['public/staff/*.js', 'public/assets/*.js'], {
    env: { browser: true, es2022: true }, parserOptions: { ecmaVersion: 2022, sourceType: 'script' }, globals: SHARED, rules: RULES
  });
  assert.deepEqual(found, []);
});

test('server and build: the same', async () => {
  const found = await problems(['lib/**/*.js', 'api/**/*.js', 'scripts/**/*.js', 'db/**/*.js', 'middleware.js'], {
    env: { node: true, es2022: true }, parserOptions: { ecmaVersion: 2022, sourceType: 'module' }, rules: RULES
  });
  assert.deepEqual(found, []);
});
