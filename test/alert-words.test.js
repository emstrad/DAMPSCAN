/**
 * The words phone alerts are built from, the new-enquiry alert, and what
 * reaches ntfy. No database: these are pure, and push() is a stubbed fetch.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let pushes = [];
globalThis.fetch = async (url, init) => { pushes.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };

const { money, firstName, district, customer, day, clock, jobPage, page, brandName } = await import('../lib/alert-words.js');
const { enquiryAlert } = await import('../lib/alert-enquiry.js');
const { push } = await import('../lib/notify.js');

beforeEach(() => { pushes = []; delete process.env.STAFF_URL; process.env.NTFY_TOPIC = 'words-test'; });

test('money is short, names are first names, postcodes are districts', () => {
  assert.equal(money(563000), '£5,630');
  assert.equal(money(563050), '£5,630.50');
  assert.equal(money(0), '£0');
  assert.equal(firstName('sarah JONES'), 'Sarah');
  assert.equal(firstName('Mrs Patel'), '', 'a title is followed by a surname, which never goes on a lock screen');
  assert.equal(district('br6 8ab'), 'BR6');
  assert.equal(district('SW1A1AA'), 'SW1A');
  assert.equal(district('BR6'), 'BR6');
  assert.equal(district('12 High Street'), '', 'a street is not a district');
  assert.equal(customer('Sarah Jones', 'BR6 8AB'), 'Sarah, BR6');
  assert.equal(customer('Mrs Patel', 'BR6 8AB'), 'a customer in BR6');
  assert.equal(customer('', ''), 'a customer');
});

test('dates and times read like a diary', () => {
  assert.equal(day('2026-10-18'), 'Sun 18 Oct');
  assert.equal(day(''), '');
  assert.equal(clock('09:30'), '9:30am');
  assert.equal(clock('14:00'), '2pm');
  assert.equal(clock('12:15'), '12:15pm');
  assert.equal(clock('00:00'), '12am');
});

test('links open the right staff page for the right company', () => {
  assert.equal(jobPage('roofing', 5), '/quoted.html?area=roofing#job-5');
  assert.equal(jobPage('ati-london', 5), '/surveys.html?area=damp#job-5');
  assert.equal(page('todo.html', null), '/calendar.html#todo', 'to-dos live in Today now');
  assert.equal(page('due.html', 'roofing'), '/calendar.html?area=roofing');
  assert.equal(brandName('dampscan'), 'DampScan');
});

test('a new enquiry says who, where and what, rings high, and keeps the number in the Call button only', async () => {
  const a = enquiryAlert('roofing', 12, { first_name: 'sarah', postcode: 'BR6 8AB', phone: '07700 900123', issues: ['Leak or water coming in', 'Flat roof'] });
  assert.equal(a.title, 'New enquiry: Verge Roofing');
  assert.equal(a.message, 'Sarah in BR6 needs help with leak or water coming in and flat roof. Tap Call to ring them back.');
  assert.equal(a.priority, 4);
  assert.deepEqual(a.actions, [
    { action: 'view', label: 'Call', url: 'tel:07700900123' },
    { action: 'view', label: 'Open', url: 'https://dampscan.co.uk/staff/dashboard.html?area=roofing' }
  ]);
  assert.ok(!/0770|8AB|jones/i.test(a.title + a.message));
  const unsure = enquiryAlert('dampscan', 13, { first_name: 'Tom', postcode: '', phone: '', issues: ['Not sure'] });
  assert.equal(unsure.message, 'Tom is not sure what the problem is. Open the leads to reply.');
  assert.deepEqual(unsure.actions.map((x) => x.label), ['Open'], 'no number, no Call button');
});

test('push sends title, tags, priority, click and actions to ntfy', async () => {
  process.env.STAFF_URL = 'https://preview.example/staff/';
  assert.equal(await push({ title: 'T', message: 'M', tags: 'tada', priority: 4, click: 'https://x/y', actions: [{ action: 'view', label: 'Open', url: 'https://x/y' }] }), true);
  assert.deepEqual(pushes[0], { topic: 'words-test', title: 'T', message: 'M', priority: 4, tags: ['tada'], click: 'https://x/y', actions: [{ action: 'view', label: 'Open', url: 'https://x/y' }] });
  await push({ title: 'T', message: 'M' });
  assert.deepEqual(Object.keys(pushes[1]).sort(), ['message', 'priority', 'tags', 'title', 'topic'], 'no empty click or actions');
  assert.equal(enquiryAlert('ac', 1, {}).actions[0].url, 'https://preview.example/staff/dashboard.html?area=ac');
});
