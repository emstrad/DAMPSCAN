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
    [['timber-localised', 95, 160], ['timber-full', 150, 250], ['invasive', 85, 145], ['camera', 85, 145], ['cavity', 95, 160]]);
});

test('the prices pages and the Lab quiz show the same figures', async () => {
  for (const site of ['ati', 'dampscan']) {
    const html = await readFile(new URL(`../public/pricing/${site}.html`, import.meta.url), 'utf8');
    for (const x of SIZES) assert.ok(html.includes(`£${x.damp}`) && html.includes(`£${x.damp + x.timber}`), `${site}: ${x.key}`);
    for (const x of EXTRAS) assert.ok(html.includes(`£${x.alone}`) && html.includes(`£${x.withSurvey}`), `${site}: ${x.key}`);
  }
  const box = { window: {} };
  vm.runInNewContext(await readFile(new URL('../public/assets/survey-quiz.js', import.meta.url), 'utf8'), box);
  const P = JSON.parse(JSON.stringify(box.window.SurveyQuiz.PRICE));
  assert.deepEqual([P.damp.localised, P.damp.full, P.dampTimber.localised, P.dampTimber.full],
    [at('localised').damp, at('full-house').damp, at('localised').damp + at('localised').timber, at('full-house').damp + at('full-house').timber]);
  assert.deepEqual([P.addOn.camera, P.addOn.cavity, P.addOn.invasive], [[extra('camera').withSurvey, extra('camera').alone], [extra('cavity').withSurvey, extra('cavity').alone], [extra('invasive').withSurvey, extra('invasive').alone]]);
});
