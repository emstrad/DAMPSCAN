/**
 * The bank reconciliation, the parts that need no database: reading Revolut's
 * CSV, guessing what a line is, splitting it between people without losing a
 * penny, and deciding which job a payment belongs to.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, revolutRows, fingerprint, toPence, splitDate } from '../lib/bank/csv.js';
import { normaliseSplit, shares, splitLabel, TARGETS } from '../lib/bank/allocate.js';
import { autoTag, ruleKey, partnerNamed, CATEGORY_KEYS } from '../lib/bank/categories.js';
import { scoreJob, suggest, autoMatch } from '../lib/bank/match.js';
import { businessCsv } from './fixtures/revolut-csv.js';

/* ---------------------------------------------------------------- csv ---- */
test('parseCsv handles quoted commas, doubled quotes, embedded newlines, CRLF and a BOM', () => {
  const text = '﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n2,"line\nbreak",\r\n';
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['1', 'x, y', 'he said "hi"'], ['2', 'line\nbreak', '']]);
});

test('toPence and splitDate read what Revolut writes', () => {
  assert.equal(toPence('-12.30'), -1230);
  assert.equal(toPence('−12.30'), -1230, 'a unicode minus');
  assert.equal(toPence('1,234.56'), 123456);
  assert.equal(toPence(''), null);
  assert.equal(toPence('abc'), null);
  assert.deepEqual(splitDate('2026-08-01 09:12:33'), ['2026-08-01', '09:12:33']);
  assert.deepEqual(splitDate('01/08/2026 09:12'), ['2026-08-01', '09:12']);
  assert.deepEqual(splitDate('2026-08-01'), ['2026-08-01', null]);
  assert.deepEqual(splitDate('yesterday'), [null, null]);
});

test('a Revolut Business export is read by column name, with the net amount kept', () => {
  const csv = businessCsv([
    { date: '2026-08-15', id: 'tx-1', description: 'BP MAIDSTONE', amount: -62.1, fee: 0.5, mcc: '5541', balance: '1000.00' },
    { date: '2026-08-12', id: 'tx-2', type: 'TRANSFER', description: 'Payment from PRIYA SHARMA', reference: 'deposit', payer: 'PRIYA SHARMA', amount: 107.5 },
    { date: '2026-08-13', id: 'tx-3', state: 'PENDING', description: 'Pending thing', amount: -5 },
    { date: '2026-08-14', id: 'tx-4', description: 'EUR thing', amount: -5, currency: 'EUR' }
  ]);
  const { rows, skipped } = revolutRows(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(skipped, { pending: 1, notGbp: 1, unreadable: 0 });

  const fuel = rows[0];
  assert.equal(fuel.postedOn, '2026-08-15');
  assert.equal(fuel.postedTime, '09:05:00');
  assert.equal(fuel.amountPence, -6260, 'the fee comes off: what actually left');
  assert.equal(fuel.feePence, 50);
  assert.equal(fuel.mcc, '5541');
  assert.equal(fuel.balancePence, 100000);
  assert.equal(fuel.externalId, 'tx-1');

  const payment = rows[1];
  assert.equal(payment.type, 'TRANSFER');
  assert.equal(payment.counterparty, 'PRIYA SHARMA');
  assert.equal(payment.reference, 'deposit');
  assert.equal(payment.amountPence, 10750);
});

test('a Revolut personal export is read too, and its fee is subtracted', () => {
  const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n'
    + 'CARD_PAYMENT,Current,2026-08-01 10:00:00,2026-08-02 10:00:00,Screwfix,-10.00,0.50,GBP,COMPLETED,90.00\n'
    + 'TOPUP,Current,2026-08-03 10:00:00,2026-08-03 10:00:00,Payment from Ben Jones,500.00,0.00,GBP,COMPLETED,590.00\n'
    + 'CARD_PAYMENT,Current,2026-08-04 10:00:00,,Pending,-1.00,0.00,GBP,PENDING,589.00\n';
  const { rows, skipped } = revolutRows(csv);
  assert.equal(rows.length, 2);
  assert.equal(skipped.pending, 1);
  assert.equal(rows[0].postedOn, '2026-08-02', 'completed, not started');
  assert.equal(rows[0].amountPence, -1050);
  assert.equal(rows[0].externalId, null);
  assert.equal(rows[1].type, 'TOPUP');
});

test('something that is not a statement is refused rather than imported', () => {
  assert.equal(revolutRows('').error, 'empty');
  assert.equal(revolutRows('name,email\nPriya,p@x.com\n').error, 'not_a_statement');
});

test('fingerprints are stable across uploads and tell identical lines apart', () => {
  const [a] = revolutRows(businessCsv([{ date: '2026-08-15', id: 'tx-1', description: 'BP', amount: -10 }])).rows;
  const [b] = revolutRows(businessCsv([{ date: '2026-08-15', id: 'tx-1', description: 'BP', amount: -10 }])).rows;
  assert.equal(fingerprint(a), fingerprint(b));

  const personal = (balance) => ({ postedOn: '2026-08-02', amountPence: -1000, description: 'Screwfix', balancePence: balance });
  assert.notEqual(fingerprint(personal(9000)), fingerprint(personal(8000)), 'two identical payments on one day differ by balance');
  assert.equal(fingerprint(personal(9000)), fingerprint(personal(9000)));
});

/* ----------------------------------------------------------- allocate ---- */
test('a split is validated and put in canonical order', () => {
  assert.deepEqual(normaliseSplit(['ben', 'scott', 'ben']), ['scott', 'ben']);
  assert.deepEqual(normaliseSplit('tom+ben'), ['tom', 'ben']);
  assert.deepEqual(normaliseSplit([]), []);
  assert.deepEqual(normaliseSplit(null), []);
  assert.equal(normaliseSplit(['dave']), null, 'an unknown name is refused, not dropped');
});

test('shares always add back to the amount, odd pennies to the earliest, in either direction', () => {
  assert.deepEqual(shares(-1000, ['scott', 'tom', 'ben']), { scott: -334, tom: -333, ben: -333, tax: 0 });
  assert.deepEqual(shares(1001, ['tom', 'ben']), { scott: 0, tom: 501, ben: 500, tax: 0 });
  assert.deepEqual(shares(-200000, ['tax']), { scott: 0, tom: 0, ben: 0, tax: -200000 });
  assert.deepEqual(shares(-500, []), { scott: 0, tom: 0, ben: 0, tax: 0 });

  for (let amount = -1003; amount <= 1003; amount += 97) {
    for (let mask = 1; mask < 16; mask += 1) {
      const split = TARGETS.filter((_, i) => mask & (1 << i));
      const s = shares(amount, split);
      const sum = TARGETS.reduce((acc, t) => acc + s[t], 0);
      assert.equal(sum, amount, `${amount} across ${split}`);
      assert.ok(TARGETS.every((t) => split.includes(t) || s[t] === 0), 'nobody outside the split gets anything');
      const shown = split.map((t) => s[t]);
      assert.ok(Math.max(...shown) - Math.min(...shown) <= 1, 'shares differ by at most a penny');
    }
  }
});

test('split labels read as people', () => {
  assert.equal(splitLabel([]), 'Not split');
  assert.equal(splitLabel(['scott', 'tom', 'ben']), 'Everyone');
  assert.equal(splitLabel(['tom', 'ben']), 'Tom + Ben');
  assert.equal(splitLabel(['tax']), 'Tax');
});

/* --------------------------------------------------------- categories ---- */
const tx = (o) => ({ type: 'CARD_PAYMENT', description: '', amountPence: -1000, ...o });

test('merchants, HMRC and partner transfers are recognised', () => {
  assert.deepEqual(autoTag(tx({ description: 'BP MAIDSTONE' })), { category: 'fuel', split: [] });
  assert.deepEqual(autoTag(tx({ description: 'Card payment', mcc: '5541' })), { category: 'fuel', split: [] });
  assert.deepEqual(autoTag(tx({ description: 'Screwfix Ashford' })), { category: 'tools', split: [] });
  assert.deepEqual(autoTag(tx({ description: 'GOOGLE *ADS 123' })), { category: 'advertising', split: [] }, 'ads before anything Google');
  assert.deepEqual(autoTag(tx({ description: 'Google Workspace' })), { category: 'software', split: [] });
  assert.deepEqual(autoTag(tx({ type: 'TRANSFER', description: 'To HMRC', reference: 'Self assessment', amountPence: -200000 })),
    { category: 'tax', split: ['tax'] });
  assert.deepEqual(autoTag(tx({ type: 'TRANSFER', description: 'To Tom Smith', amountPence: -50000 })),
    { category: 'drawings', split: ['tom'] });
  assert.deepEqual(autoTag(tx({ type: 'FEE', description: 'Monthly plan fee' })), { category: 'fees', split: [] });
  assert.deepEqual(autoTag(tx({ description: 'Some shop nobody knows' })), { category: 'other', split: [] });
});

test('a name is only trusted where the line says whose money it is', () => {
  assert.deepEqual(autoTag(tx({ description: "Ben's Plumbing Supplies" })), { category: 'other', split: [] },
    'a card payment to a shop with Ben in its name is a shop');
  assert.deepEqual(autoTag(tx({ type: 'TRANSFER', description: 'Payment from Tom Jones', amountPence: 21500 })),
    { category: 'income', split: [] }, 'a transfer in from a Tom is a customer until somebody says otherwise');
  assert.deepEqual(autoTag(tx({ type: 'TOPUP', description: 'Top-up from Ben Smith', amountPence: 50000 })),
    { category: 'capital', split: ['ben'] }, 'a top-up is the account holder\'s own money');
  assert.deepEqual(autoTag(tx({ type: 'TRANSFER', description: 'To Scott and Tom', amountPence: -100 })),
    { category: 'other', split: [] }, 'two names is nobody');
  assert.equal(partnerNamed('thomas the tank'), 'tom');
  assert.equal(partnerNamed('tomorrow'), null);
});

test('rule keys drop the numbers so repeat visits to a merchant share one key', () => {
  const a = ruleKey({ description: 'Card payment to BP MAIDSTONE 1234', counterparty: null });
  const b = ruleKey({ description: 'Card payment to BP MAIDSTONE 5678' });
  assert.equal(a, b);
  assert.equal(a, 'card payment to bp maidstone');
  assert.equal(ruleKey({ counterparty: 'PRIYA SHARMA', description: 'Payment from PRIYA SHARMA' }), 'priya sharma payment from priya sharma');
});

test('every category the importer can produce is a real category', () => {
  const produced = ['fuel', 'tools', 'advertising', 'software', 'tax', 'drawings', 'fees', 'other', 'income', 'capital', 'refund', 'cash', 'transfer'];
  for (const key of produced) assert.ok(CATEGORY_KEYS.includes(key), key);
});

/* -------------------------------------------------------------- match ---- */
const job = (o) => ({ id: 1, jobDate: '2026-08-20', customerName: 'Priya Sharma', firstName: 'Priya', postcode: 'ME14 1AA',
  surveyPricePence: 21500, remedialPence: 0, receivedPence: 0, ...o });
const pay = (o) => ({ postedOn: '2026-08-12', amountPence: 21500, counterparty: 'PRIYA SHARMA', reference: '', description: 'Payment from PRIYA SHARMA', ...o });

test('a payment scores on amount, name, postcode and date', () => {
  assert.equal(scoreJob(pay(), job()), 3 + 2 + 1, 'price, surname, within a fortnight');
  assert.equal(scoreJob(pay({ amountPence: 10750 }), job()), 6, 'the deposit is the price too');
  assert.equal(scoreJob(pay({ amountPence: 10750 }), job({ receivedPence: 10750 })), 6, 'and so is what is left');
  assert.equal(scoreJob(pay({ counterparty: 'MR X', description: '', reference: 'ME141AA' }), job()), 3 + 3 + 1, 'a squashed postcode counts');
  assert.equal(scoreJob(pay({ amountPence: 9999, counterparty: 'MR X', description: '' }), job()), 1, 'date alone barely registers');
  assert.equal(scoreJob(pay({ postedOn: '2026-03-01' }), job()), null, 'outside the window is not a candidate');
  assert.equal(scoreJob(pay({ amountPence: -21500 }), job()), null, 'money out is never a payment');
});

test('the importer matches only a clear winner', () => {
  const jobs = [job({ id: 1 }), job({ id: 2, customerName: 'Sam Patel', firstName: 'Sam', postcode: 'CT1 1AA' })];
  assert.equal(autoMatch(pay(), jobs), 1, 'name plus amount is enough');
  assert.equal(autoMatch(pay({ counterparty: 'SOMEONE', description: '' }), jobs), null, 'two jobs at that price is a tie, and a tie waits');
  assert.equal(autoMatch(pay({ counterparty: 'SOMEONE', description: '' }), [job({ id: 1 })]), 1, 'one job at that price this fortnight is enough');
  assert.deepEqual(suggest(pay({ counterparty: 'SOMEONE', description: '' }), jobs).map((s) => s.jobId), [1, 2]);

  const twins = [job({ id: 1 }), job({ id: 2 })];
  assert.equal(autoMatch(pay(), twins), null, 'two jobs for the same person is a question, not a match');
  assert.equal(suggest(pay(), twins).length, 2);
});
