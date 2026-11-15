/**
 * The end-to-end review before UAT (14 Nov 2026): the 48-hour refund rule
 * measured from the booked time even after Not going ahead, a survey paid in
 * full ahead of its visit still reads Booked, and a balance can be paid once
 * the visit is done.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async () => [], queryOne: async () => null, ping: async () => true } });
const { cancelRule, moneyOf, buildView } = await import('../lib/portal-view.js');
const { jobStage } = await import('../lib/journey.js');
const { askOf } = await import('../lib/page-asks.js');

const at = (ms) => new Date(Date.now() + ms);
const day = (ms) => at(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

test('cancelled 52 hours before a 14:00 survey is a full refund; an unbooked one too', () => {
  const start = at(52 * 3600000);
  const time = start.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const j = { survey_price_pence: 100, paid_pence: 50, deposit_paid_at: new Date(), job_day: day(52 * 3600000), job_time: time, cancelled_at: new Date(), status: 'cancelled' };
  assert.equal(cancelRule(j, moneyOf(j)), 'refund');
  assert.equal(cancelRule({ ...j, job_time: null }, moneyOf(j)), 'refund', 'no time booked: nothing to lose');
  const late = { ...j, job_day: day(20 * 3600000), job_time: at(20 * 3600000).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) };
  assert.equal(cancelRule(late, moneyOf(late)), 'kept');
});

test('paid in full before the visit is still Booked, not Report to send', () => {
  const j = { status: 'booked', date_set: true, job_date: day(3 * 86400000), job_time: '14:00', paid_at: new Date() };
  assert.equal(jobStage(j), 'Booked');
  assert.equal(jobStage({ ...j, job_date: day(-86400000) }), 'Report to send');
});

test('after the visit the balance can be paid on their page', () => {
  const j = { site: 'ati-london', status: 'booked', date_set: true, job_day: day(-86400000), job_time: '14:00', survey_price_pence: 100, paid_pence: 50, deposit_paid_at: new Date() };
  const v = buildView(j);
  assert.equal(v.state, 'writing');
  assert.equal(v.money.balancePence, 50);
});

test('Needs you now: a page message until the team logs a reply, a move while the survey is still where it was', () => {
  const j = { day: '2026-11-21', job_time: '14:00:00', sched_log: [
    { by: 'Scott', how: 'call', note: 'Booked' }, { by: 'Their page', how: 'note', note: 'They wrote on their page: Can you park on the drive?' },
    { by: 'Their page', how: 'note', note: 'Added 1 photo on their page.' }] };
  assert.deepEqual(askOf(j) && [askOf(j).what, askOf(j).text], ['message', 'Can you park on the drive?']);
  assert.equal(askOf({ ...j, sched_log: [...j.sched_log, { by: 'Tom', how: 'text', note: 'Replied' }] }), null, 'answered');
  assert.equal(askOf({ ...j, move_request: { date: '2026-11-24', time: '10:00', from: '2026-11-21 14:00' } }).what, 'move');
  assert.equal(askOf({ ...j, sched_log: [], move_request: { date: '2026-11-24', time: '10:00', from: '2026-11-20 09:00' } }), null, 'moved already');
});

test('their page shows only what they wrote: a card the team made keeps its notes to us', () => {
  const base = { site: 'ati-london', status: 'booked', survey_price_pence: 100, lead_notes: 'Rang about damp in the hall, sounded keen' };
  assert.equal(buildView({ ...base, lead_source: 'phone' }).enquiry, null);
  assert.equal(buildView({ ...base, lead_source: 'email' }).enquiry, null);
  assert.equal(buildView({ ...base, lead_source: '/damp-survey-london' }).enquiry.said, base.lead_notes);
});
