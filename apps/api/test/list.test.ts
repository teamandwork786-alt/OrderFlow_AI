import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectOrders, needsAttention, type OrderListRow } from '../src/modules/orders-query/listOrders.js';

let n = 0;
function row(over: Partial<OrderListRow> = {}): OrderListRow {
  n++;
  return {
    id: `id-${String(n).padStart(4, '0')}`,
    orderNumber: `#${1000 + n}`,
    customerName: 'Demo Customer',
    lifecycleStatus: 'PAID',
    eligibilityStatus: 'ELIGIBLE',
    eligibilityReason: null,
    trackingNumber: null,
    isStale: false,
    hasPendingConfirmation: false,
    hasDeadLetter: false,
    conflictFlag: false,
    conflictReviewed: false,
    hasRefundApplication: false,
    createdAt: new Date(Date.UTC(2026, 10, 20, 0, n)),
    ...over,
  };
}

describe('order list (FR-03, S1)', () => {
  const rows = [
    row({ orderNumber: '#1001', customerName: 'Ayesha Khan' }),
    row({ orderNumber: '#1002', customerName: 'Bilal Ahmed', lifecycleStatus: 'PREPARING' }),
    row({ orderNumber: '#1003', customerName: 'Sana Malik', lifecycleStatus: 'DISPATCH_PENDING' }),
    row({ orderNumber: '#1004', customerName: 'Omar Raza', lifecycleStatus: 'DISPATCHED', trackingNumber: 'TRK-998877' }),
    row({ orderNumber: '#1005', customerName: 'Zara Iqbal', lifecycleStatus: 'DELIVERED', trackingNumber: 'TRK-112233' }),
    row({
      orderNumber: '#1006',
      customerName: 'Cancelled Person',
      lifecycleStatus: 'CANCELLED',
      eligibilityStatus: 'INELIGIBLE',
      eligibilityReason: 'CANCELLED',
    }),
    row({
      orderNumber: '#1007',
      customerName: 'Unpaid Person',
      lifecycleStatus: 'PENDING_PAYMENT',
      eligibilityStatus: 'INELIGIBLE',
      eligibilityReason: 'NOT_PAID',
    }),
    row({
      orderNumber: '#1008',
      customerName: 'Mismatch Person',
      lifecycleStatus: 'PENDING_PAYMENT',
      eligibilityStatus: 'INELIGIBLE',
      eligibilityReason: 'AMOUNT_MISMATCH',
    }),
  ];
  const numbers = (q = {}) =>
    selectOrders(rows, q)
      .items.map((r) => r.orderNumber)
      .sort();

  it('M1: the default view shows eligible, not-yet-dispatched orders only (newest first)', () => {
    assert.deepEqual(numbers(), ['#1001', '#1002', '#1003']);
    assert.deepEqual(
      selectOrders(rows).items.map((r) => r.orderNumber),
      ['#1003', '#1002', '#1001'],
    );
  });
  it('M2: unpaid and mismatched orders are not in the default queue', () => {
    const shown = numbers();
    assert.ok(!shown.includes('#1007') && !shown.includes('#1008') && !shown.includes('#1006'));
  });
  it('filters: dispatched, completed, needs attention', () => {
    assert.deepEqual(numbers({ filter: 'dispatched' }), ['#1004']);
    assert.deepEqual(numbers({ filter: 'completed' }), ['#1005', '#1006']);
    assert.deepEqual(numbers({ filter: 'needs_attention' }), ['#1008']); // plain NOT_PAID is not attention
  });
  it('needs attention covers stale actionable, pending confirmation, open conflict and dead letter', () => {
    assert.equal(needsAttention(row({ isStale: true })), true);
    assert.equal(needsAttention(row({ isStale: true, lifecycleStatus: 'DISPATCHED' })), false);
    assert.equal(needsAttention(row({ hasPendingConfirmation: true })), true);
    assert.equal(needsAttention(row({ conflictFlag: true })), true);
    assert.equal(needsAttention(row({ conflictFlag: true, conflictReviewed: true })), false);
    assert.equal(needsAttention(row({ hasDeadLetter: true })), true);
    assert.equal(needsAttention(row({ eligibilityReason: 'REFUNDED_OR_VOIDED' })), true);
  });
  it('searches order number with or without #, name (any case), and tracking number', () => {
    assert.deepEqual(numbers({ filter: 'pending', search: '1001' }), ['#1001']);
    assert.deepEqual(numbers({ filter: 'pending', search: '#1002' }), ['#1002']);
    assert.deepEqual(numbers({ filter: 'pending', search: 'AYESHA' }), ['#1001']);
    assert.deepEqual(numbers({ filter: 'dispatched', search: 'trk-9988' }), ['#1004']);
  });
  it('search never matches phone numbers or addresses (they are not even in the row)', () => {
    const withPhone = rows.map((r) => ({ ...r, customerPhone: '+920000000000', address: '1 Demo Street' })) as OrderListRow[];
    assert.equal(selectOrders(withPhone, { search: '0000000' }).total, 0);
    assert.equal(selectOrders(withPhone, { search: 'Demo Street' }).total, 0);
  });
  it('a blank search returns everything in the filter', () => assert.equal(selectOrders(rows, { search: '   ' }).total, 3));
  it('the refund-application indicator is a separate filter', () => {
    const rs = [row({ hasRefundApplication: true }), row()];
    assert.equal(selectOrders(rs, { hasRefundApplication: true }).total, 1);
    assert.equal(selectOrders(rs, { hasRefundApplication: false }).total, 1);
  });

  describe('pagination (BVA: default 25, maximum 100)', () => {
    const many = Array.from({ length: 130 }, () => row());
    it('defaults to 25 per page', () => assert.equal(selectOrders(many).items.length, 25));
    it('honours 1 and 100, clamps 0 and 101 and negatives', () => {
      assert.equal(selectOrders(many, { pageSize: 1 }).items.length, 1);
      assert.equal(selectOrders(many, { pageSize: 100 }).items.length, 100);
      assert.equal(selectOrders(many, { pageSize: 101 }).pageSize, 100);
      assert.equal(selectOrders(many, { pageSize: 0 }).pageSize, 1);
      assert.equal(selectOrders(many, { pageSize: -5 }).pageSize, 1);
    });
    it('pages do not overlap and the last page is partial; pages below 1 become 1; beyond the end is empty', () => {
      const p1 = selectOrders(many, { pageSize: 100, page: 1 }).items;
      const p2 = selectOrders(many, { pageSize: 100, page: 2 }).items;
      assert.equal(p2.length, 30);
      assert.equal(new Set([...p1, ...p2].map((r) => r.id)).size, 130);
      assert.equal(selectOrders(many, { page: 0 }).page, 1);
      assert.equal(selectOrders(many, { pageSize: 100, page: 3 }).items.length, 0);
      assert.equal(selectOrders(many).total, 130);
    });
  });
});
