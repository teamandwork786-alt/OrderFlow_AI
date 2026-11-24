import type {
  AuditSink,
  InboxItem,
  InboxRepo,
  NewInboxItem,
  OrderRepo,
  StoredOrder,
  SyncWrite,
} from '../../src/modules/webhooks-inbox/ports.js';
import type { DomainShopifyOrder, EligibilityResult, LifecycleStatus } from '../../src/modules/sync/types.js';

/** In-memory test doubles for the storage ports. They mimic the Prisma repositories' contract. */

export class MemoryInbox implements InboxRepo {
  items = new Map<string, InboxItem & { lastErrorCode?: string; processedAt?: Date }>();
  private seq = 0;
  async insertIfAbsent(n: NewInboxItem): Promise<boolean> {
    for (const i of this.items.values()) if (i.shopifyWebhookId === n.shopifyWebhookId) return false;
    const id = `inbox-${++this.seq}`;
    this.items.set(id, {
      id,
      shopifyWebhookId: n.shopifyWebhookId,
      topic: n.topic,
      shopDomain: n.shopDomain,
      resourceId: n.resourceId,
      payload: n.payload,
      status: 'RECEIVED',
      attemptCount: 0,
      nextRetryAt: new Date(0),
      lockedUntil: null,
    });
    return true;
  }
  async claimDue(now: Date, limit: number, leaseMs: number): Promise<InboxItem[]> {
    const due = [...this.items.values()]
      .filter(
        (i) =>
          ((i.status === 'RECEIVED' || i.status === 'FAILED') && i.nextRetryAt <= now) ||
          (i.status === 'PROCESSING' && i.lockedUntil !== null && i.lockedUntil <= now),
      )
      .slice(0, limit);
    for (const i of due) {
      i.status = 'PROCESSING';
      i.lockedUntil = new Date(now.getTime() + leaseMs);
    }
    return due.map((i) => ({ ...i }));
  }
  async markProcessed(id: string, now: Date) {
    const i = this.items.get(id)!;
    i.status = 'PROCESSED';
    i.processedAt = now;
    i.lockedUntil = null;
  }
  async markFailed(id: string, attemptCount: number, nextRetryAt: Date, code: string) {
    const i = this.items.get(id)!;
    i.status = 'FAILED';
    i.attemptCount = attemptCount;
    i.nextRetryAt = nextRetryAt;
    i.lastErrorCode = code;
    i.lockedUntil = null;
  }
  async markDeadLetter(id: string, attemptCount: number, code: string) {
    const i = this.items.get(id)!;
    i.status = 'DEAD_LETTER';
    i.attemptCount = attemptCount;
    i.lastErrorCode = code;
    i.lockedUntil = null;
  }
  get all() {
    return [...this.items.values()];
  }
}

export interface MemoryOrder {
  id: string;
  order: DomainShopifyOrder;
  evaluation: EligibilityResult;
  lifecycleStatus: LifecycleStatus;
  orderVersion: number;
  paymentVerifiedAt: string | null;
  shopifyUpdatedAt: Date;
}

export class MemoryOrders implements OrderRepo {
  rows = new Map<string, MemoryOrder>();
  writes = 0;
  async getByShopifyId(id: string): Promise<StoredOrder | null> {
    const r = this.rows.get(id);
    return r ? { id: r.id, lifecycleStatus: r.lifecycleStatus, orderVersion: r.orderVersion, shopifyUpdatedAt: r.shopifyUpdatedAt } : null;
  }
  async listActionableShopifyIds(): Promise<string[]> {
    return [...this.rows.entries()]
      .filter(([, r]) => ['PAID', 'PREPARING', 'DISPATCH_PENDING'].includes(r.lifecycleStatus))
      .map(([id]) => id);
  }
  async applySync(w: SyncWrite): Promise<void> {
    this.writes++;
    const prev = this.rows.get(w.order.shopifyOrderId);
    const to = w.transition?.to ?? prev?.lifecycleStatus ?? 'PENDING_PAYMENT';
    const bump = prev && w.transition ? 1 : 0; // version bumps only on a lifecycle transition, never on a plain refresh
    this.rows.set(w.order.shopifyOrderId, {
      id: prev?.id ?? `order-${this.rows.size + 1}`,
      order: w.order,
      evaluation: w.evaluation,
      lifecycleStatus: to,
      orderVersion: (prev?.orderVersion ?? 1) + bump,
      paymentVerifiedAt: prev?.paymentVerifiedAt ?? w.transition?.paymentVerifiedAt ?? null,
      shopifyUpdatedAt: new Date(w.order.updatedAt),
    });
  }
}

export class MemoryAudit implements AuditSink {
  events: { eventType: string; details: Record<string, unknown> }[] = [];
  async record(e: { eventType: string; details: Record<string, unknown> }) {
    this.events.push({ eventType: e.eventType, details: e.details });
  }
}
