/**
 * The owners' alert texts: who they go to, what they say (the customer's
 * number to tap, first name and district, never a street), and nothing at
 * all until Twilio and ALERT_SMS_TO are set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textOwners, enquiryText, pickText, ownerMobiles } from '../lib/staff-sms.js';
import { twilioSend } from '../lib/sms.js';

test('an enquiry text names the brand, first name, district, problems and the number', () => {
  const t = enquiryText('dampscan', 7, { first_name: 'Kim Lee', postcode: 'me19 6ab', phone: '07700 900123', issues: ['Rising damp', 'Not sure'] });
  assert.match(t, /^New DampScan enquiry: Kim, ME19, rising damp\. Call 07700 900123\. https:\/\/.+#lead-7$/);
  assert.ok(!/6AB|Lee/.test(t));
});

test('a picked time says when, for whom, and to confirm it', () => {
  const t = pickText({ id: 3, site: 'ati-london', first_name: 'Sam', postcode: 'SE18 3AB', phone: '' }, 'Tue 4 Nov at 10am', 'Tom');
  assert.match(t, /Sam \(SE18\) picked Tue 4 Nov at 10am online for Tom\. Confirm it on Scheduling\. No phone given\./);
});

test('texts go to each owner listed, and to nobody when none are', async () => {
  process.env.ALERT_SMS_TO = '07700 900001, +447700900002';
  const sent = [];
  assert.equal(await textOwners('hi', async (m) => { sent.push(m.to); return { sent: true }; }), 2);
  assert.deepEqual(sent, ['07700 900001', '+447700900002']);
  process.env.ALERT_SMS_TO = '';
  assert.deepEqual(ownerMobiles(), []);
  assert.equal(await textOwners('hi', async () => { throw new Error('never called'); }), 0);
});

test('nothing goes through Twilio until its details are set', async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  assert.deepEqual(await twilioSend({ to: '07700900001', body: 'x', fetchImpl: () => { throw new Error('no'); } }), { sent: false, why: 'off' });
});
