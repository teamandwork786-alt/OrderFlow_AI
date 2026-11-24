import type { EligibilityReason, LifecycleStatus } from '../sync/types.js';

/** Fields the order list may read. Deliberately contains no phone number and no address. */
export interface OrderListRow {
  id: string;
  orderNumber: string; // for example "#1001"
  customerName: string | null;
  lifecycleStatus: LifecycleStatus;
  eligibilityStatus: 'PENDING_VERIFICATION' | 'ELIGIBLE' | 'INELIGIBLE';
  eligibilityReason: EligibilityReason | null;
  trackingNumber: string | null;
  isStale: boolean;
  hasPendingConfirmation: boolean;
  hasDeadLetter: boolean;
  conflictFlag: boolean;
  conflictReviewed: boolean;
  hasRefundApplication: boolean;
  createdAt: Date;
}

export type OrderFilter = 'pending' | 'dispatched' | 'completed' | 'needs_attention';

export interface OrderListQuery {
  filter?: OrderFilter;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Separate flag and filter for the refund-application indicator. */
  hasRefundApplication?: boolean;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

const ACTIONABLE: LifecycleStatus[] = ['PAID', 'PREPARING', 'DISPATCH_PENDING'];

export function needsAttention(r: OrderListRow): boolean {
  return (
    r.eligibilityReason === 'AMOUNT_MISMATCH' ||
    r.eligibilityReason === 'REFUNDED_OR_VOIDED' ||
    (r.isStale && ACTIONABLE.includes(r.lifecycleStatus)) ||
    r.hasPendingConfirmation ||
    (r.conflictFlag && !r.conflictReviewed) ||
    r.hasDeadLetter
  );
}

function matchesFilter(r: OrderListRow, filter: OrderFilter): boolean {
  switch (filter) {
    case 'pending':
      return r.eligibilityStatus === 'ELIGIBLE' && ACTIONABLE.includes(r.lifecycleStatus);
    case 'dispatched':
      return r.lifecycleStatus === 'DISPATCHED';
    case 'completed':
      return r.lifecycleStatus === 'DELIVERED' || r.lifecycleStatus === 'CANCELLED';
    case 'needs_attention':
      return needsAttention(r);
  }
}

/** Search covers order number, customer name and tracking number only. */
function matchesSearch(r: OrderListRow, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t === '') return true;
  const number = r.orderNumber.toLowerCase();
  return (
    number.includes(t) ||
    number.replace('#', '').includes(t.replace('#', '')) ||
    (r.customerName ?? '').toLowerCase().includes(t) ||
    (r.trackingNumber ?? '').toLowerCase().includes(t)
  );
}

export interface OrderListPage {
  items: OrderListRow[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Pure list selection: the SQL-backed repository must return exactly the same rows.
 * Resolved default: with no filter the view is `pending` (eligible, not yet dispatched).
 */
export function selectOrders(rows: OrderListRow[], query: OrderListQuery = {}): OrderListPage {
  const filter = query.filter ?? 'pending';
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(query.page ?? 1), 1);

  const matched = rows
    .filter((r) => matchesFilter(r, filter))
    .filter((r) => (query.hasRefundApplication === undefined ? true : r.hasRefundApplication === query.hasRefundApplication))
    .filter((r) => matchesSearch(r, query.search ?? ''))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));

  const start = (page - 1) * pageSize;
  return { items: matched.slice(start, start + pageSize), page, pageSize, total: matched.length };
}
