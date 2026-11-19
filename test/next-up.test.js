/**
 * What's next (lib/next-up.js): every open customer lands in the right lane
 * with the right one next step, worked out from the facts alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobRow, leadRow } from '../lib/next-up.js';

const TODAY = '2026-11-19';
const NOW = Date.parse('2026-11-19T12:00:00Z');
const base = { id: 1, site: 'ati-london', status: 'booked', customer_name: 'Kim Lee', customer_postcode: 'SE4 1PE', survey_price_pence: 29500, remedial_pence: 0,
  paid_pence: 0, date_set: true, job_date: '2026-11-25', job_time: '10:00:00', sched_log: [], created_at: '2026-11-10T10:00:00Z', booked_at: '2026-11-18T20:00:00Z' };
const job = (o) => jobRow({ ...base, ...o }, TODAY, NOW);

test('a booked survey: deposit due is theirs, then ours to chase after 48 hours or close to the day; paid ones sit in Booked', () => {
  assert.deepEqual([job({}).lane, job({}).next], ['them', 'Deposit due']);
  assert.deepEqual([job({ booked_at: '2026-11-15T10:00:00Z' }).lane, job({ booked_at: '2026-11-15T10:00:00Z' }).next], ['us', 'Chase the deposit']);
  assert.equal(job({ job_date: '2026-11-20' }).lane, 'us', 'the day after tomorrow or sooner');
  const paid = job({ deposit_paid_at: '2026-11-18T21:00:00Z', tick_deposit_pence: 14750 });
  assert.equal(paid.lane, 'booked');
  assert.match(paid.next, /^Survey Wed 25 Nov at 10:00/);
});

test('after the visit: the report is ours; once ready the balance is theirs, then ours to chase after three days; old money says so', () => {
  const surveyed = job({ job_date: '2026-11-17', status: 'completed', deposit_paid_at: '2026-11-16T09:00:00Z', tick_deposit_pence: 14750 });
  assert.deepEqual([surveyed.lane, surveyed.next], ['us', 'Write and send the report']);
  assert.match(surveyed.why, /£147\.50 still owed/);
  const ready = job({ job_date: '2026-11-17', status: 'completed', deposit_paid_at: '2026-11-16T09:00:00Z', tick_deposit_pence: 14750, report_ready_at: '2026-11-18T12:00:00Z' });
  assert.deepEqual([ready.lane, ready.next], ['them', '£147.50 balance due']);
  const waited = job({ job_date: '2026-11-09', status: 'completed', deposit_paid_at: '2026-11-09T09:00:00Z', tick_deposit_pence: 14750, report_ready_at: '2026-11-10T12:00:00Z', texts_off: true });
  assert.deepEqual([waited.lane, waited.next, waited.oldMoney], ['us', 'Chase the £147.50 balance', true]);
  assert.match(waited.why, /old money/);
  assert.equal(job({ paid_at: '2026-11-18T10:00:00Z', tick_paid_pence: 29500, survey_sent_at: '2026-11-18T11:00:00Z', status: 'completed', job_date: '2026-11-17' }), null, 'paid and reported is done');
  assert.equal(job({ status: 'cancelled' }), null);
});

test('their page and the agent come first: a move or a message is Needs you now; waiting on the agent is its own lane', () => {
  const asked = job({ move_request: { date: '2026-11-27', time: '14:00', from: '2026-11-25 10:00', at: '2026-11-19T09:00:00Z' } });
  assert.deepEqual([asked.lane, asked.next], ['now', 'Move them to Fri 27 Nov at 14:00']);
  const msg = job({ sched_log: [{ at: '2026-11-19T09:00:00Z', by: 'Their page', note: 'They wrote on their page: Can you come earlier?' }] });
  assert.deepEqual([msg.lane, msg.next], ['now', 'Reply to their message']);
  assert.equal(job({ awaiting_agent: true }).lane, 'agent');
});

test('an enquiry: new is ours (Needs you now after two hours), a due follow-up is ours, otherwise we wait on them; cold is folded', () => {
  const l = { id: 9, site: 'dampscan', first_name: 'Olie', postcode: 'TN24 8HF', stage: 'complete', created_at: new Date(Date.now() - 3 * 3600000).toISOString(), updated_at: '2026-11-18T10:00:00Z' };
  assert.deepEqual([leadRow(l, TODAY).lane, leadRow(l, TODAY).next], ['now', 'Call them back']);
  assert.equal(leadRow({ ...l, created_at: new Date().toISOString() }, TODAY).lane, 'us');
  assert.deepEqual([leadRow({ ...l, sched_stage: 'contacted', next_contact_on: '2026-11-19', next_contact_why: 'Chase a date' }, TODAY).lane, leadRow({ ...l, sched_stage: 'contacted', next_contact_on: '2026-11-19', next_contact_why: 'Chase a date' }, TODAY).next], ['us', 'Get back to them: Chase a date']);
  assert.equal(leadRow({ ...l, sched_stage: 'contacted', next_contact_on: '2026-11-24' }, TODAY).lane, 'them');
  assert.equal(leadRow({ ...l, sched_stage: 'cold' }, TODAY).lane, 'cold');
  assert.equal(leadRow({ ...l, closed_at: '2026-11-18T10:00:00Z' }, TODAY), null);
});
