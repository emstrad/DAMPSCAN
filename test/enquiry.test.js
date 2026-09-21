/**
 * The form and the validator read one list, and this proves the built pages
 * agree with it. Both used to carry DampScan's issues independently, which
 * held for two damp brands and broke silently for the third: the roofing form
 * offered "Damp" and "Mould", and its validator accepted nothing else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENQUIRY, enquiryFor } from '../lib/enquiry.js';
import { SITE_KEYS } from '../lib/site.js';

/* One built page per brand that carries the form. */
const SAMPLE = {
  dampscan: '../public/service-pages/dampscan/ventilation.html',
  'ati-london': '../public/service-pages/ati/ventilation.html',
  roofing: '../public/service-pages/roofing/re-roofs.html',
  ac: '../public/service-pages/ac/multi-split-systems.html'
};

const offered = (html) =>
  [...html.matchAll(/name="Issue" value="([^"]+)"/g)].map((m) => m[1]);

test('every brand the request side knows has an enquiry definition', () => {
  for (const key of SITE_KEYS) assert.ok(enquiryFor(key), `${key} has no enquiry definition`);
  assert.deepEqual(enquiryFor('ati'), ENQUIRY['ati-london'], 'the build key for ATi resolves to its runtime entry');
});

test('the issues a brand\'s form offers are exactly the ones its validator accepts', async () => {
  for (const [key, path] of Object.entries(SAMPLE)) {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.deepEqual(offered(html), enquiryFor(key).issues, `${key}: form and validator disagree`);
  }
});

test('the quoted trades do not ask about damp, and end on "Not sure"', async () => {
  for (const key of ['roofing', 'ac']) {
    const html = await readFile(new URL(SAMPLE[key], import.meta.url), 'utf8');
    const list = offered(html);
    for (const damp of ['Damp', 'Mould', 'Timber / Woodworm']) {
      assert.equal(list.includes(damp), false, `${key} still offers "${damp}"`);
    }
    assert.equal(list.at(-1), 'Not sure', 'an escape hatch is always the last option');
    /* The specific damp wording, rather than the word "survey", because a
       roofer does survey a roof and the copy is allowed to say so. */
    for (const damp of ['Book your survey', 'Book a survey', 'Get My Survey Booked',
      'Address for the survey', 'Previous surveys or photos', 'surveyors will contact']) {
      assert.equal(html.includes(damp), false, `${key} still carries "${damp}"`);
    }
  }
});
