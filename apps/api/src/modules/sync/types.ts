/** OrderFlow domain shapes for Shopify data. Domain code never sees raw Shopify or GraphQL payloads. */

export type TransactionKind = 'SALE' | 'CAPTURE' | 'AUTHORIZATION' | 'VOID' | 'REFUND';
export type TransactionStatus = 'SUCCESS' | 'PENDING' | 'FAILURE' | 'ERROR';

export interface DomainTransaction {
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  test: boolean;
  amount: string; // decimal string
  currency: string;
  processedAt: string; // ISO 8601
  gateway: string;
}

export interface DomainFulfillment {
  id: string;
  status: 'SUCCESS' | 'OPEN' | 'PENDING' | 'CANCELLED' | 'ERROR' | 'FAILURE';
  trackingNumber?: string;
}

export interface DomainLineItem {
  shopifyLineItemId: string;
  productId: string | null;
  variantId: string | null;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export type FinancialStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'VOIDED'
  | 'EXPIRED';

export interface DomainShopifyOrder {
  shopifyOrderId: string;
  orderNumber: string;
  financialStatus: FinancialStatus;
  cancelledAt: string | null;
  currency: string;
  subtotalAmount: string;
  shippingAmount: string;
  totalAmount: string;
  transactions: DomainTransaction[];
  refunds: { id: string }[];
  fulfillments: DomainFulfillment[];
  paymentGatewayNames: string[];
  customer: { name: string | null; email: string | null; phone: string | null };
  shippingAddress: Record<string, unknown> | null;
  lineItems: DomainLineItem[];
  updatedAt: string; // ISO 8601
}

export type LifecycleStatus = 'PENDING_PAYMENT' | 'PAID' | 'PREPARING' | 'DISPATCH_PENDING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export type EligibilityReason =
  | 'NOT_PAID'
  | 'CANCELLED'
  | 'ALREADY_FULFILLED'
  | 'CURRENCY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'TEST_TRANSACTION'
  | 'REFUNDED_OR_VOIDED'
  | 'COD_NOT_SUPPORTED'
  | 'GATEWAY_NOT_ALLOWED';

export type EligibilityResult = { status: 'ELIGIBLE'; paymentVerifiedAt: string } | { status: 'INELIGIBLE'; reasonCode: EligibilityReason };

/** Permanent failures (order missing, bad payload) go straight to dead letter. */
export class ShopifyPermanentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ShopifyPermanentError';
  }
}
/** Transient failures (network, 5xx, throttling) are retried. They never cause a permanent business outcome. */
export class ShopifyTransientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ShopifyTransientError';
  }
}
