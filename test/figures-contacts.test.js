/**
 * A work-level person sees contacts only on their own jobs: on anyone else's
 * the map links, notes, message and form session go, and a customer's name
 * shrinks to the first name.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../lib/db.js', {
  namedExports: { query: async () => [{ id: 7 }], queryOne: async () => null, sql: () => null, ping: async () => true }
});
const { hideFigures } = await import('../lib/figures.js');

const ronnie = { isAdmin: false, personId: 4, name: 'Ronnie', businesses: ['dampscan'], levels: { dampscan: 'work' } };
const row = (jobId) => ({ site: 'dampscan', jobId, customer: 'Kim Jones', phone: '07700900000', maps: 'https://maps.example/x', notes: 'Agent: Sam 07700900001', message: 'Damp in the hall', sessionId: 'abc', postcode: 'ME19 6AB' });

test('someone else\'s job loses contacts, map, notes, message and session', async () => {
  const [out] = await hideFigures([row(8)], ronnie);
  assert.equal(out.customer, 'Kim');
  for (const k of ['phone', 'maps', 'notes', 'message', 'sessionId']) assert.equal(k in out, false, k);
  assert.equal(out.postcode, 'ME19');
});

test('his own job keeps everything', async () => {
  const [out] = await hideFigures([row(7)], ronnie);
  assert.equal(out.customer, 'Kim Jones');
  assert.equal(out.phone, '07700900000');
  assert.equal(out.notes, 'Agent: Sam 07700900001');
});
