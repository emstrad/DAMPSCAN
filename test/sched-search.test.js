/* The Scheduling search: forgiving matches on name, postcode, phone and email. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(new URL('../public/staff/sched-search.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const { score } = ctx.window.DSSCHEDSEARCH;
const kim = { name: 'Rebecca Freund', postcode: 'NW1 9UB', phone: '07864 054693', email: 'freund.re@gmail.com', notes: 'Buying, report needed quickly' };

test('finds by name, typo, postcode, phone and email', () => {
  assert.ok(score(kim, 'rebecca') > 0);
  assert.ok(score(kim, 'Rebbeca') > 0, 'one letter out');
  assert.ok(score(kim, 'nw19ub') > 0 && score(kim, 'NW1') > 0);
  assert.ok(score(kim, '07864054693') > 0 && score(kim, '054693') > 0);
  assert.ok(score(kim, 'freund.re') > 0);
  assert.ok(score(kim, 'rebecca nw1') > score(kim, 'buying'), 'name beats a word in the message');
  assert.equal(score(kim, 'sophie'), 0);
  assert.equal(score(kim, 'rebecca se4'), 0, 'every word must match');
});
