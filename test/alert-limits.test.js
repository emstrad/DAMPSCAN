/**
 * Keeping ntfy's daily limit for what matters: after a 429 routine pushes
 * wait out the minute while urgent ones still go, and the two-hour cron
 * schedule runs only on London's hour, summer and winter.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../lib/db.js', {
  namedExports: { sql: () => {}, query: async () => [], queryOne: async () => null, ping: async () => true }
});

const { push, resetPushBackoff } = await import('../lib/notify.js');
const { rightHour, londonOffset } = await import('../lib/routes/cron/london-hour.js');

test('after a 429 routine pushes are skipped for the minute, urgent ones still go', async () => {
  process.env.NTFY_TOPIC = 'owners';
  const sent = [];
  let status = 429;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).priority); return { ok: status < 300, status, text: async () => 'limit' }; };
  resetPushBackoff();
  assert.equal(await push({ title: 't', message: 'm', priority: 3 }), false);
  assert.equal(await push({ title: 't', message: 'm', priority: 3 }), false);
  assert.deepEqual(sent, [3]);
  assert.match(push.lastError, /429/);
  status = 200;
  assert.equal(await push({ title: 't', message: 'new enquiry', priority: 4 }), true);
  assert.deepEqual(sent, [3, 4]);
  resetPushBackoff();
  delete process.env.NTFY_TOPIC;
});

test('the morning and evening runs go ahead only on London\'s hour', () => {
  const winter = new Date('2026-12-01T05:30:00Z');
  const summer = new Date('2026-07-01T05:30:00Z');
  assert.equal(londonOffset(winter), 0);
  assert.equal(londonOffset(summer), 1);
  const at = (utc) => ({ url: `/api/cron/digest?utc=${utc}` });
  assert.equal(rightHour(at(5), 6, summer), true);
  assert.equal(rightHour(at(6), 6, summer), false);
  assert.equal(rightHour(at(5), 6, winter), false);
  assert.equal(rightHour(at(6), 6, winter), true);
  assert.equal(rightHour(at(16), 17, summer), true);
  assert.equal(rightHour(at(17), 17, winter), true);
  assert.equal(rightHour({ url: '/api/cron/digest' }, 6, winter), true);
});
