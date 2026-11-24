import type { DomainFulfillment, DomainShopifyOrder } from '../../modules/sync/types.js';

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export type FulfillmentResult =
  | { outcome: 'CONFIRMED'; fulfillmentId: string }
  | { outcome: 'REJECTED'; reason: string }
  | { outcome: 'UNKNOWN' };

/**
 * The only door to Shopify. There is intentionally NO refund, return, order-edit or payment method.
 * Implementations throw ShopifyTransientError for retryable failures and ShopifyPermanentError otherwise.
 */
export interface ShopifyAdapter {
  getOrder(shopifyOrderId: string): Promise<DomainShopifyOrder>;
  listFulfillments(shopifyOrderId: string): Promise<DomainFulfillment[]>;
  listOrdersUpdatedSince(since: Date, cursor?: string): Promise<Page<string>>;
  createFulfillment(input: {
    shopifyOrderId: string;
    trackingNumber: string;
    notifyCustomer: boolean;
    requestId: string;
  }): Promise<FulfillmentResult>;
  ping(): Promise<void>;
}
