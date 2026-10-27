import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobStage, leadStage } from '../lib/journey.js';

test('each customer is at one stage, worked out the same way everywhere', () => {
  const t = '2026-10-27';
  assert.equal(jobStage({ status: 'booked', date_set: true, job_date: '2026-10-30', job_time: '09:00' }, t), 'Booked');
  assert.equal(jobStage({ status: 'booked', date_set: true, job_date: '2026-10-20', job_time: '09:00' }, t), 'Surveyed');
  assert.equal(jobStage({ status: 'booked', date_set: true, job_date: '2026-10-20', survey_sent_at: 'x' }, t), 'Report sent');
  assert.equal(jobStage({ status: 'booked', paid_at: 'x' }, t), 'Paid');
  assert.equal(jobStage({ status: 'cancelled', paid_at: 'x' }, t), 'Cancelled');
  assert.equal(jobStage({ status: 'booked', date_set: false }, t), 'Waiting for time');
  assert.equal(jobStage({ status: 'booked', date_set: false, pencil_date: '2026-11-01', pencil_until: null }, t), 'Pencilled');
  assert.equal(leadStage({ sched_stage: null }), 'New');
  assert.equal(leadStage({ sched_stage: 'contacted' }), 'Contacted');
  assert.equal(leadStage({ closed_at: 'x' }), 'Closed');
});
