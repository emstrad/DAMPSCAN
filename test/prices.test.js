/* One price list: the prices pages, the website's survey step and the Lab's
   quiz all show the same figures as content/prices.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { SIZES, EXTRAS } from '../content/prices.js';

const at = (k) => SIZES.find((x) => x.key === k);
const extra = (k) => EXTRAS.find((x) => x.key === k);

test('the September price list, by size', () => {
  assert.deepEqual(SIZES.map((x) => [x.key, x.damp, x.damp + x.timber, x.minutes]),
    [['localised', 215, 310, 60], ['full-house', 295, 445, 120], ['large-property', 375, 525, 150], ['premium', 450, 600, 180]]);
  assert.deepEqual(EXTRAS.map((x) => [x.key, x.withSurvey, x.alone]),
    [['timber-localised', 95, 160], ['timber-full', 150, 250], ['invasive', 85, 145], ['camera', 85, 145], ['cavity', 95, 160], ['drone', 149, null]]);
});

test('the prices pages and the Lab quiz show the same figures', async () => {
  for (const site of ['ati', 'dampscan']) {
    const html = await readFile(new URL(`../public/pricing/${site}.html`, import.meta.url), 'utf8');
    for (const x of SIZES) assert.ok(html.includes(`£${x.damp}`) && html.includes(`£${x.damp + x.timber}`), `${site}: ${x.key}`);
    for (const x of EXTRAS.filter((e) => e.addable)) assert.ok(html.includes(`£${x.withSurvey}`), `${site}: ${x.key}`);
    /* A damp survey always; checks are only added to one (the owners' choice, 8 Nov 2026). */
    assert.equal(/On its own/.test(html), false, `${site}: no on-its-own prices`);
  }
  /* The survey step (Lab and site) prices from the same list the server sends. */
  const box = { window: { scrollY: 0, scrollTo() {} } };
  vm.runInNewContext(await readFile(new URL('../public/assets/survey-pick.js', import.meta.url), 'utf8'), box);
  const S = box.window.SurveyPick;
  const list = JSON.parse(JSON.stringify({ sizes: SIZES, extras: EXTRAS }));
  assert.deepEqual(JSON.parse(JSON.stringify(S.total(list, { size: 'full-house', timber: true, extras: ['drone', 'camera'] }))), { pounds: 295 + 150 + 149 + 85, from: false });
  assert.equal(S.total(list, { size: 'large-property', timber: false, extras: [] }).from, true, 'a "from" size says so');
});

test('the survey step recommends from what the form told us, and never ticks an extra for them', async () => {
  const box = { window: { scrollY: 0, scrollTo() {} } };
  vm.runInNewContext(await readFile(new URL('../public/assets/survey-pick.js', import.meta.url), 'utf8'), box);
  const r = (k) => JSON.parse(JSON.stringify(box.window.SurveyPick.recommend(k)));
  assert.equal(r({ buying: true, beds: 3 }).size, 'full-house', 'buyers get the whole house');
  assert.equal(r({ agent: true, beds: 5 }).size, 'large-property', 'the agent letting us in means buying; five bedrooms is large');
  assert.equal(r({ beds: 2, scope: 'one' }).size, 'localised');
  assert.equal(r({ beds: 7, scope: 'whole' }).size, 'premium');
  assert.equal(r({ beds: 3, scope: 'one', timber: true }).timber, true);
  assert.deepEqual(Object.keys(r({ buying: true, beds: 3, floors: true }).suggest).sort(), ['camera', 'drone']);
  assert.equal(r({ beds: 3, scope: 'one' }).suggest.drone, undefined, 'no drone pushed on a one-room job');
});

test('option D builds the survey plan a surveyor would, and never offers a check that cannot apply', async () => {
  const box = { window: {} };
  vm.runInNewContext(await readFile(new URL('../public/assets/survey-plan.js', import.meta.url), 'utf8'), box);
  const list = JSON.parse(JSON.stringify({ sizes: SIZES, extras: EXTRAS }));
  const plan = (a) => JSON.parse(JSON.stringify(box.window.SurveyPlan.build(a, list)));
  const keys = (p, k) => p.plans.find((x) => x.key === k).lines.map((l) => l.key);
  const buyer = plan({ situation: 'buying', see: ['rot', 'leak'], type: 'house', beds: 3 });
  assert.deepEqual(buyer.plans.map((p) => [p.key, p.total]), [['essential', 295], ['recommended', 295 + 150 + 85 + 149]], 'a buyer gets the survey alone or our recommendation');
  assert.match(buyer.lead, /exchange/);
  const ground = plan({ situation: 'damp', see: ['leak', 'rot'], type: 'flat', floor: 'ground', beds: 2 });
  assert.ok(!JSON.stringify(ground).includes('"drone"'), 'no drone over a ground floor flat');
  const upper = plan({ situation: 'damp', see: ['rot'], type: 'flat', floor: 'upper', beds: 2 });
  assert.ok(!JSON.stringify(upper).includes('"camera"'), 'no floor camera in an upstairs flat');
  const mould = plan({ situation: 'damp', see: ['mould', 'condensation'], type: 'house', beds: 3 });
  assert.deepEqual(keys(mould, 'recommended'), ['core']);
  assert.equal(mould.plans.find((p) => p.key === 'recommended').size, 'localised', 'mould alone is a focused survey');
  assert.match(mould.lead, /condensation/);
  assert.match(plan({ situation: 'quote', see: ['tide'], type: 'house', beds: 3 }).lead, /really needed/);
  assert.equal(plan({ situation: 'buying', see: ['none'], type: 'house', beds: 5 }).plans.find((p) => p.key === 'recommended').size, 'large-property');
});
