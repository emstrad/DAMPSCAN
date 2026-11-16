/**
 * One booking form, everywhere.
 *
 * The form used to exist twice: hand written in public/index.html and
 * public/london.html, and generated from scripts/book-form.js for the other
 * seventy-odd pages. They drifted, quietly and in both directions. The home
 * pages reworded their buttons and their success message and the generated
 * pages kept DampScan's wording on both sites, so ATi's area pages offered to
 * "book" a survey ATi does not book. Later a field was removed from one copy
 * and left in the other, which is a form that posts different data depending
 * on which page you found it on.
 *
 * build-pages.js now writes the form into the home pages too, so these tests
 * are the thing that notices if anyone edits the generated markup by hand and
 * does not rerun the build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bookForm } from '../scripts/book-form.js';

const ROOT = new URL('..', import.meta.url).pathname;
const HOME = { dampscan: 'public/index.html', ati: 'public/london.html' };

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

test('the home pages carry exactly what book-form.js generates', async () => {
  for (const [site, file] of Object.entries(HOME)) {
    const html = await readFile(join(ROOT, file), 'utf8');
    assert.ok(
      html.includes(bookForm(site)),
      `${file} does not contain the current bookForm('${site}') output. Run npm run build:pages.`
    );
  }
});

test('every page with a booking form has the same fields in it', async () => {
  /* The ids book.js drives. A page missing one of these is a page where that
     part of the form silently does nothing. */
  const REQUIRED = [
    'f-name', 'f-email', 'f-postcode', 'f-addr1', 'f-town', 'f-addr-postcode',
    'f-phone', 'f-prev', 'f-files', 'f-notes', 'f-hp'
  ];
  /* The damp sites' form (bf.js) keeps step 1 in the page and draws the rest. */
  const DAMP = ['f-name', 'f-email', 'f-phone', 'f-postcode', 'f-addr1', 'f-town', 'f-access-me', 'f-agent-on', 'f-agent', 'f-agent-phone', 'f-hp', 'ht-next'];
  const pages = (await htmlFiles(join(ROOT, 'public'))).filter((p) => !p.includes('/staff/'));
  let withForm = 0;

  for (const path of pages) {
    const html = await readFile(path, 'utf8');
    if (html.includes('id="ht-form"')) {
      withForm++;
      for (const id of DAMP) assert.ok(html.includes(`id="${id}"`), `${path} is missing #${id}`);
      for (const js of ['bf-need', 'bf-done', 'bf-live', 'bf']) assert.ok(html.includes(`/assets/${js}.js`), `${path} does not load ${js}.js`);
      assert.ok(!html.includes('<script src="/assets/book.js'), `${path} still loads the old form's script`);
      continue;
    }
    if (!html.includes('id="book-form"')) continue;
    withForm++;
    for (const id of REQUIRED) {
      assert.ok(html.includes(`id="${id}"`), `${path} is missing #${id}`);
    }
    /* Removed when the address collapsed to street, town and postcode. A page
       still carrying it is a page the build has not been run over. */
    assert.ok(!html.includes('f-addr2'), `${path} still has the removed address line 2`);
  }

  assert.ok(withForm > 60, `expected the form on most pages, found it on ${withForm}`);
});

test('each site keeps its own wording, because ATi surveys rather than books', () => {
  const ds = bookForm('dampscan');
  const ati = bookForm('ati');

  assert.match(ds, /Book your survey/);
  assert.match(ati, /Request your survey/);
  assert.ok(!ati.includes('Book My Survey') && !ati.includes('Book your survey'), 'ATi must not offer to book the work it does not do');

  // The brand class is what flips the card to ATi's palette.
  assert.match(ati, /class="book-card is-brand"/);
  assert.match(ds, /class="book-card"/);
});

test('the damp form asks for the full address in step 1, street before town', () => {
  const html = bookForm('dampscan');
  const line1 = html.indexOf('id="f-addr1"');
  const town = html.indexOf('id="f-town"');
  assert.ok(line1 !== -1 && town !== -1);
  assert.ok(line1 < town, 'street should come before town');
  /* The quoted trades keep the old order: street, town, then the property's postcode. */
  const roof = bookForm('roofing');
  assert.ok(roof.indexOf('id="f-town"') < roof.indexOf('id="f-addr-postcode"'), 'town should come before postcode');
});
