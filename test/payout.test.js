/**
 * The two quoted-trade payout engines, against the agreements they implement.
 *
 * The roofing figures are the worked examples from the agreement itself, so a
 * change that moves any of them is a change to what somebody is paid and needs
 * saying out loud. The air conditioning example is the one agreed in the plan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { roofingPayout } from '../lib/payout/roofing.js';
import { acPayout } from '../lib/payout/ac.js';
import { payoutFor, MODELS } from '../lib/payout/index.js';

const P = (pounds) => Math.round(pounds * 100);

/* ------------------------------------------------------------ roofing ---- */

test('roofing example A: a 700 pound day job pays the 50 pound floor', () => {
  const r = roofingPayout({
    invoiceNetPence: P(700),
    costs: [{ label: 'Materials', amountPence: P(100) }],
    ownerDays: [{ personId: 1, days: 1, dayRatePence: P(250) }]
  });
  assert.equal(r.scottFee, P(50));
  assert.equal(r.floorApplied, true);
  assert.equal(r.wages, P(250));
  /* The agreement shows 300 retained without a reserve on this job. The engine
     reserves on every job, as agreed since, so the company keeps 300 less the
     19% on the 600 balance. Scott's fee is unaffected either way. */
  assert.equal(r.reserve, P(114));
  assert.equal(r.retained, P(300) - P(114));
});

test('roofing example B: the 10,000 pound re-roof pays 182.25 and loses money', () => {
  const r = roofingPayout({
    invoiceNetPence: P(10000),
    costs: [
      { label: 'Materials', amountPence: P(4500) },
      { label: 'Scaffolding', amountPence: P(1000) }
    ],
    ownerDays: [
      { personId: 1, days: 5, dayRatePence: P(250) },
      { personId: 2, days: 5, dayRatePence: P(250) },
      { personId: 3, days: 5, dayRatePence: P(250) }
    ]
  });
  assert.equal(r.balance, P(4500));
  assert.equal(r.reserve, P(855));
  assert.equal(r.feeBase, P(3645));
  assert.equal(r.scottFee, P(182.25));
  assert.equal(r.floorApplied, false);
  assert.equal(r.wages, P(3750));
  assert.equal(r.retained, -P(287.25));
  assert.equal(r.lossMaking, true, 'the loss is shown, and the fee is still paid');
});

test('the floor removes the backwards band between 1,000 and 2,750', () => {
  /* Under the original cut-off a 999 pound job paid 50 and a 1,200 pound job
     with 400 of materials paid 32.40. The floor makes the line rise or stay
     flat; it never dips. */
  const at = (invoice, materials) =>
    roofingPayout({ invoiceNetPence: P(invoice), costs: [{ label: 'm', amountPence: P(materials) }] }).scottFee;
  assert.equal(at(999, 300), P(50));
  assert.equal(at(1000, 300), P(50), 'not 28.35');
  assert.equal(at(1200, 400), P(50), 'not 32.40');
  assert.equal(at(2000, 800), P(50), 'not 48.60');
  assert.equal(at(2800, 1200), P(64.80), 'above the crossover the percentage wins');
  let last = 0;
  for (let invoice = 500; invoice <= 6000; invoice += 50) {
    const fee = at(invoice, invoice * 0.45);
    assert.ok(fee >= last, `fee fell between ${invoice - 50} and ${invoice}`);
    last = fee;
  }
});

test('an extra cost line reduces the fee exactly as agreed, and the floor caps the downside', () => {
  const base = { invoiceNetPence: P(10000), costs: [{ label: 'Materials', amountPence: P(4500) }, { label: 'Scaffolding', amountPence: P(1000) }] };
  const without = roofingPayout(base).scottFee;
  const withSkip = roofingPayout({ ...base, costs: [...base.costs, { label: 'Skip', amountPence: P(300) }] }).scottFee;
  assert.equal(without, P(182.25));
  assert.equal(withSkip, P(170.10));
  /* Costs can push the fee down to the floor and no further. */
  const buried = roofingPayout({ ...base, costs: [{ label: 'Everything', amountPence: P(9990) }] });
  assert.equal(buried.scottFee, P(50));
});

test('a roofing job that costs more than it invoices reserves nothing and still pays the floor', () => {
  const r = roofingPayout({ invoiceNetPence: P(1000), costs: [{ label: 'm', amountPence: P(1500) }] });
  assert.equal(r.balance, -P(500));
  assert.equal(r.reserve, 0, 'no negative tax accrual');
  assert.equal(r.scottFee, P(50));
  assert.equal(r.lossMaking, true);
});

test('roofing rates are stored per job and reported back, so a stored job can be explained later', () => {
  const r = roofingPayout({ invoiceNetPence: P(5000), reserveBp: 2500, feeBp: 600, feeFloorPence: P(75) });
  assert.deepEqual(r.rates, { reserveBp: 2500, feeBp: 600, feeFloorPence: P(75) });
  assert.equal(r.reserve, P(1250));
  assert.equal(r.scottFee, P(225));
});

/* --------------------------------------------------------- air conditioning ---- */

test('the agreed AC example: 2,800 invoice, 1,800 of costs, 500 each', () => {
  const r = acPayout({
    invoiceNetPence: P(2800),
    costs: [{ label: 'Units', amountPence: P(1200) }, { label: 'Labour', amountPence: P(600) }]
  });
  assert.equal(r.profit, P(1000));
  assert.deepEqual(r.pay, { scott: P(500), tom: P(500) });
});

test('an odd penny of AC profit goes to the first party and the halves always add back', () => {
  for (const profit of [1001, 1, 3, 99999, 123457]) {
    const r = acPayout({ invoiceNetPence: profit, costs: [] });
    assert.equal(r.pay.scott + r.pay.tom, profit, `profit ${profit} did not add back`);
    assert.ok(r.pay.scott >= r.pay.tom);
    assert.ok(r.pay.scott - r.pay.tom <= 1);
  }
});

test('an AC loss pays nobody and is not hidden', () => {
  const r = acPayout({ invoiceNetPence: P(1000), costs: [{ label: 'Units', amountPence: P(1300) }] });
  assert.equal(r.profit, -P(300), 'the true figure is kept');
  assert.equal(r.payoutProfit, 0);
  assert.deepEqual(r.pay, { scott: 0, tom: 0 });
  assert.equal(r.lossMaking, true);
});

test('the two engines treat a loss in opposite ways, on purpose', () => {
  const roof = roofingPayout({ invoiceNetPence: P(1000), costs: [{ label: 'm', amountPence: P(1500) }] });
  const air = acPayout({ invoiceNetPence: P(1000), costs: [{ label: 'm', amountPence: P(1500) }] });
  assert.equal(roof.scottFee, P(50), 'roofing pays its fee on a loss');
  assert.equal(air.pay.scott, 0, 'air conditioning pays nothing on a loss');
});

/* ------------------------------------------------------------ dispatch ---- */

test('the dispatcher knows exactly three models and refuses a fourth', () => {
  assert.deepEqual(MODELS, ['damp', 'roofing', 'ac']);
  assert.equal(payoutFor('roofing', { invoiceNetPence: P(700) }).model, 'roofing');
  assert.equal(payoutFor('ac', { invoiceNetPence: P(700) }).model, 'ac');
  assert.ok(payoutFor('damp', { surveyPence: P(215), surveyorFeePence: P(100), surveyor: 'tom' }).pay, 'damp is the existing waterfall');
  assert.throws(() => payoutFor('plumbing', {}), /no payout engine/, 'the wrong agreement is not a fallback');
});
