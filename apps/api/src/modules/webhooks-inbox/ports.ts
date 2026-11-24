import type { DomainShopifyOrder, EligibilityResult, LifecycleStatus } from '../sync/types.js';

export type InboxStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';

export interface InboxItem {
  id: string;
  shopifyWebhookId: string;
  topic: string;
  shopDomain: string;
  resourceId: string | null;
  payload: unknown;
  status: InboxStatus;
  attemptCount: number;
  nextRetryAt: Date;
  lockedUntil: Date | null;
}

export interface NewInboxItem {
  shopifyWebhookId: string;
  shopifyEventId: string | null;
  topic: string;
  shopDomain: string;
  apiVersion: string | null;
  shopifyTriggeredAt: Date | null;
  resourceId: string | null;
  payload: unknown;
}

/** Storage port for the webhook inbox. The Prisma implementation uses INSERT ... ON CONFLICT DO NOTHING and FOR UPDATE SKIP LOCKED. */
export interface InboxRepo {
  /** Returns true if a new row was stored, false if the delivery ID already existed (duplicate). */
  insertIfAbsent(item: NewInboxItem): Promise<boolean>;
  /** Atomically claims due items (RECEIVED or FAILED and due, or PROCESSING with an expired lease). */
  claimDue(now: Date, limit: number, leaseMs: number): Promise<InboxItem[]>;
  markProcessed(id: string, now: Date): Promise<void>;
  markFailed(id: string, attemptCount: number, nextRetryAt: Date, code: string, message: string): Promise<void>;
  markDeadLetter(id: string, attemptCount: number, code: string, message: string): Promise<void>;
}

export interface StoredOrder {
  id: string;
  lifecycleStatus: LifecycleStatus;
  orderVersion: number;
  shopifyUpdatedAt: Date;
}

export interface SyncWrite {
  order: DomainShopifyOrder;
  evaluation: EligibilityResult;
  /** null when the lifecycle does not change. */
  transition: { to: LifecycleStatus; paymentVerifiedAt?: string } | null;
  isNew: boolean;
  now: Date;
}

/** Storage port for orders. applySync MUST write snapshot, eligibility, lifecycle change and audit events in ONE transaction. */
export interface OrderRepo {
  getByShopifyId(shopifyOrderId: string): Promise<StoredOrder | null>;
  applySync(write: SyncWrite): Promise<void>;
  /** Shopify IDs of local orders in PAID, PREPARING or DISPATCH_PENDING (refreshed by reconciliation regardless of age). */
  listActionableShopifyIds(): Promise<string[]>;
}

export interface AuditSink {
  /** Details are an allowlisted, PII-free object. */
  record(event: {
    eventType: string;
    actorType: 'USER' | 'SYSTEM' | 'SHOPIFY';
    shopifyOrderId?: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}
