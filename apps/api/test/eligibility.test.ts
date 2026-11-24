import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixtureOrder, baseOrder, type FixtureName } from '../src/integrations/shopify/mock/fixtures.js';
import { evaluateEligibility } from '../src/modules/sync/eligibility.js';
import { toMinorUnits } from '../src/lib/money.js';

describe('S1 eligibility (PRD scenarios 1 and 2)', () => {
  it('M1: an eligible paid PKR order is ELIGIBLE with a verification time', () => {
    const r = evaluateEligibility(fixtureOrder('paid', 'o1'));
    assert.equal(r.status, 'ELIGIBLE');
    assert.equal(r.status === 'ELIGIBLE' && r.paymentVerifiedAt, '2026-11-20T10:00:00.000Z');
  });

  const blocked: [FixtureName, string][] = [
    ['unpaid', 'NOT_PAID'],
    ['cancelled', 'CANCELLED'],
    ['test_payment', 'TEST_TRANSACTION'],
    ['refunded', 'REFUNDED_OR_VOIDED'],
    ['partially_refunded', 'REFUNDED_OR_VOIDED'],
    ['wrong_currency', 'CURRENCY_MISMATCH'],
    ['amount_mismatch', 'AMOUNT_MISMATCH'],
    ['cod', 'COD_NOT_SUPPORTED'],
    ['already_fulfilled', 'ALREADY_FULFILLED'],
  ];
  for (const [name, reason] of blocked) {
    it(`M2: ${name} is blocked with ${reason}`, () => {
      const r = evaluateEligibility(fixtureOrder(name, 'o2'));
      assert.deepEqual(r, { status: 'INELIGIBLE', reasonCode: reason });
    });
  }

  it('boundary: payment one paisa under the total is blocked, exact and split payments pass', () => {
    const under = baseOrder('b1', { transactions: [{ ...baseOrder('b1').transactions[0]!, amount: '4749.99' }] });
    const exact = baseOrder('b2');
    const over = baseOrder('b3', { transactions: [{ ...baseOrder('b3').transactions[0]!, amount: '4750.01' }] });
    assert.equal(evaluateEligibility(under).status, 'INELIGIBLE');
    assert.equal(evaluateEligibility(exact).status, 'ELIGIBLE');
    assert.equal(evaluateEligibility(over).status, 'INELIGIBLE'); // over-payment is also a mismatch
  });

  it('split payment: verified time is when the cumulative total is first reached', () => {
    const r = evaluateEligibility(fixtureOrder('split_payment', 's1'));
    assert.equal(r.status, 'ELIGIBLE');
    assert.equal(r.status === 'ELIGIBLE' && r.paymentVerifiedAt, '2026-11-20T09:30:00.000Z');
  });

  it('a failed or pending transaction does not count toward the total', () => {
    const o = baseOrder('f1', { transactions: [{ ...baseOrder('f1').transactions[0]!, status: 'FAILURE' }] });
    assert.deepEqual(evaluateEligibility(o), { status: 'INELIGIBLE', reasonCode: 'AMOUNT_MISMATCH' });
  });

  it('a cancelled fulfillment does not block eligibility', () => {
    const o = baseOrder('c1', { fulfillments: [{ id: 'f', status: 'CANCELLED' }] });
    assert.equal(evaluateEligibility(o).status, 'ELIGIBLE');
  });

  it('reason precedence: cancelled wins over refunded and unpaid', () => {
    const o = baseOrder('p1', { cancelledAt: '2026-11-20T11:00:00.000Z', financialStatus: 'REFUNDED', refunds: [{ id: 'r' }] });
    assert.deepEqual(evaluateEligibility(o), { status: 'INELIGIBLE', reasonCode: 'CANCELLED' });
  });

  it('a VOID or REFUND transaction blocks even if the financial status looks paid', () => {
    const t = baseOrder('v1').transactions;
    const o = baseOrder('v1', { transactions: [...t, { ...t[0]!, id: 'v', kind: 'VOID' }] });
    assert.deepEqual(evaluateEligibility(o), { status: 'INELIGIBLE', reasonCode: 'REFUNDED_OR_VOIDED' });
  });

  it('optional gateway allowlist: unset passes, listed passes, unlisted is blocked', () => {
    const o = fixtureOrder('paid', 'g1');
    assert.equal(evaluateEligibility(o).status, 'ELIGIBLE');
    assert.equal(evaluateEligibility(o, { allowedGateways: ['Manual-Bank-Transfer'] }).status, 'ELIGIBLE');
    assert.deepEqual(evaluateEligibility(o, { allowedGateways: ['stripe'] }), { status: 'INELIGIBLE', reasonCode: 'GATEWAY_NOT_ALLOWED' });
  });
});

describe('money (exact decimals, EP and BVA)', () => {
  it('converts valid amounts exactly', () => {
    assert.equal(toMinorUnits('0'), 0);
    assert.equal(toMinorUnits('0.01'), 1);
    assert.equal(toMinorUnits('4750'), 475000);
    assert.equal(toMinorUnits('4750.5'), 475050);
    assert.equal(toMinorUnits('0.10') + toMinorUnits('0.20'), toMinorUnits('0.30')); // floats would fail this
  });
  for (const bad of ['', '-1', '1.234', '1,000', 'abc', '1e3', ' ', '1.']) {
    it(`rejects ${JSON.stringify(bad)}`, () => assert.throws(() => toMinorUnits(bad), RangeError));
  }
});
