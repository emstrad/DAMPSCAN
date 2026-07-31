/**
 * The earnings maths. These numbers are what people get paid, so the rules are
 * pinned here rather than trusted to hold: the lead fee comes off the post-tax
 * figure, the remainder goes to the two partners only, and every job's payouts
 * add back to exactly what the job distributes, with no penny lost or invented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcJob, bpOf, halve, DEFAULTS } from '../lib/splits.js';

const RATE_CARD = [
  { name: 'Localised', price: 21500, fee: 10000, afterTax: 17200, lead: 2580, each: 2310 },
  { name: 'Full House', price: 29500, fee: 13000, afterTax: 23600, lead: 3540, each: 3530 },
  { name: 'Large Property', price: 37500, fee: 16000, afterTax: 30000, lead: 4500, each: 4750 },
  { name: 'Premium', price: 45000, fee: 19000, afterTax: 36000, lead: 5400, each: 5800 }
];

test('the four survey types reproduce the agreed table exactly', () => {
  for (const row of RATE_CARD) {
    const c = calcJob({ surveyPence: row.price, surveyorFeePence: row.fee, surveyor: 'tom' });
    assert.equal(c.survey.afterTax, row.afterTax, `${row.name} after tax`);
    assert.equal(c.survey.lead, row.lead, `${row.name} lead fee`);
    assert.deepEqual(c.survey.perPartner, [row.each, row.each], `${row.name} partner shares`);
  }
});

test('the lead fee is taken on the post-tax figure, not the headline price', () => {
  const c = calcJob({ surveyPence: 21500, surveyorFeePence: 10000, surveyor: 'tom' });
  assert.equal(c.survey.lead, 2580, '15% of 172.00');
  assert.notEqual(c.survey.lead, 3225, '15% of 215.00 would be wrong');
});

test('the surveyor fee follows whoever did the survey', () => {
  const base = { surveyPence: 21500, surveyorFeePence: 10000 };

  const byTom = calcJob({ ...base, surveyor: 'tom' });
  assert.deepEqual(byTom.pay, { scott: 2580, tom: 12310, ben: 2310 });

  const byScott = calcJob({ ...base, surveyor: 'scott' });
  assert.deepEqual(byScott.pay, { scott: 12580, tom: 2310, ben: 2310 });

  const byBen = calcJob({ ...base, surveyor: 'ben' });
  assert.deepEqual(byBen.pay, { scott: 2580, tom: 2310, ben: 12310 });
});

test('the lead earner is paid on every job whoever surveyed it', () => {
  for (const surveyor of ['scott', 'tom', 'ben']) {
    const c = calcJob({ surveyPence: 45000, surveyorFeePence: 19000, surveyor });
    const lead = c.pay[DEFAULTS.leadEarner];
    assert.ok(lead >= 5400, `${surveyor}: lead earner still gets the 15%`);
  }
});

test('the remainder goes to the two partners only, never to the lead earner', () => {
  // Scott surveying is the case that would expose a three way split.
  const c = calcJob({ surveyPence: 21500, surveyorFeePence: 10000, surveyor: 'scott' });
  assert.equal(c.pay.scott, 2580 + 10000, 'lead fee plus the surveyor fee, and no share');
  assert.deepEqual(c.survey.perPartner, [2310, 2310]);
});

test('remedial work pays the lead fee and leaves the balance to be settled offline', () => {
  const c = calcJob({
    surveyPence: 21500,
    surveyorFeePence: 10000,
    surveyor: 'tom',
    remedialPence: 400000 // 4,000 pounds
  });
  assert.equal(c.remedial.afterTax, 320000);
  assert.equal(c.remedial.lead, 48000, '15% of 3,200.00');
  assert.equal(c.remedial.settledOffline, 272000);

  // The remedial balance must not reach the partners: they settle materials
  // and labour between themselves.
  assert.equal(c.pay.tom, 10000 + 2310);
  assert.equal(c.pay.ben, 2310);
  assert.equal(c.pay.scott, 2580 + 48000);
});

test('payouts always add back to exactly what the job distributes', () => {
  const prices = [21500, 29500, 37500, 45000, 1, 99, 12345, 100001];
  const fees = [0, 1, 10000, 13000, 7777];
  const remedials = [0, 1, 33333, 400000];

  for (const surveyPence of prices) {
    for (const surveyorFeePence of fees) {
      for (const remedialPence of remedials) {
        const c = calcJob({ surveyPence, surveyorFeePence, remedialPence, surveyor: 'ben' });
        const paid = c.pay.scott + c.pay.tom + c.pay.ben;
        assert.equal(
          paid,
          c.distributed,
          `${surveyPence}/${surveyorFeePence}/${remedialPence}: ${paid} paid vs ${c.distributed} distributed`
        );
      }
    }
  }
});

test('an odd penny is given to one partner rather than lost', () => {
  assert.deepEqual(halve(4620), [2310, 2310]);
  assert.deepEqual(halve(4621), [2311, 2310]);
  assert.deepEqual(halve(1), [1, 0]);
  assert.deepEqual(halve(0), [0, 0]);
  // Both shares always add back to the whole, in either direction.
  for (const n of [-7, -1, 0, 1, 3, 999, 4621]) {
    const [a, b] = halve(n);
    assert.equal(a + b, n, `halve(${n})`);
  }
});

test('a job priced below its own costs shows a negative share rather than hiding it', () => {
  // 50 pound survey with a 100 pound surveyor fee: the partners are out of pocket.
  const c = calcJob({ surveyPence: 5000, surveyorFeePence: 10000, surveyor: 'tom' });
  assert.equal(c.survey.afterTax, 4000);
  assert.equal(c.survey.lead, 600);
  assert.equal(c.survey.remainder, -6600);
  assert.deepEqual(c.survey.perPartner, [-3300, -3300]);
  assert.equal(c.pay.scott + c.pay.tom + c.pay.ben, c.distributed);
});

test('rounding is to the nearest penny, halves away from zero', () => {
  assert.equal(bpOf(100, 1500), 15);
  assert.equal(bpOf(10, 1500), 2, '1.5p rounds to 2p');
  assert.equal(bpOf(30, 1500), 5, '4.5p rounds to 5p');
  assert.equal(bpOf(-10, 1500), -2, 'and away from zero on the way down');
  assert.equal(bpOf(17200, 1500), 2580);
});

test('the rates used are reported back, so a stored job can be explained later', () => {
  const c = calcJob({
    surveyPence: 21500,
    surveyorFeePence: 10000,
    surveyor: 'tom',
    taxBp: 1900,
    leadBp: 1000,
    leadEarner: 'ben',
    partners: ['scott', 'tom']
  });
  assert.deepEqual(c.rates, {
    taxBp: 1900,
    leadBp: 1000,
    leadEarner: 'ben',
    partners: ['scott', 'tom']
  });
  assert.equal(c.survey.afterTax, 17415);
  assert.equal(c.pay.ben, 1742, 'the lead fee follows whoever is set to receive it');
  assert.equal(c.pay.scott + c.pay.tom + c.pay.ben, c.distributed);
});
