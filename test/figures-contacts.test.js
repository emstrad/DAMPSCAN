/**
 * A work-level person sees every customer's contact details (the owner's
 * choice, so a survey handed over at short notice can still be reached),
 * on anyone's job, but never what any of it is worth.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../lib/db.js', {
  namedExports: { query: async () => [{ id: 7 }], queryOne: async () => null, sql: () => null, ping: async () => true }
});
const { hideFigures } = await import('../lib/figures.js');

const ronnie = { isAdmin: false, personId: 4, name: 'Ronnie', businesses: ['dampscan'], levels: { dampscan: 'work' } };
const row = (jobId) => ({ site: 'dampscan', jobId, customer: 'Kim Jones', phone: '07700900000', maps: 'https://maps.example/x', notes: 'Agent: Sam 07700900001', postcode: 'ME19 6AB', pricePence: 29500, depositPaid: true });

test('someone else\'s job keeps its contacts for a surveyor, and loses its money', async () => {
  const [out] = await hideFigures([row(8)], ronnie);
  assert.equal(out.customer, 'Kim Jones');
  assert.equal(out.phone, '07700900000');
  assert.equal(out.postcode, 'ME19 6AB');
  assert.equal('pricePence' in out, false);
  assert.equal(out.depositPaid, true);
});
