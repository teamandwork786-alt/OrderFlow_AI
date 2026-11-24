// Prisma implementations of the storage ports. NOT compiled or run in the authoring sandbox
// (Prisma could not be installed there): run `npm run typecheck` and the DB integration tests first.
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuditSink, InboxItem, InboxRepo, NewInboxItem, OrderRepo, StoredOrder, SyncWrite } from '../modules/webhooks-inbox/ports.js';
import type { LifecycleStatus } from '../modules/sync/types.js';
import type { OrderListRow } from '../modules/orders-query/listOrders.js';

const CHECKLIST = [
  [1, 'confirm_order_customer', 'Confirm the order and customer details'],
  [2, 'verify_products_quantities', 'Verify every product and quantity'],
  [3, 'inspect_condition', 'Inspect product condition'],
  [4, 'pack_securely', 'Pack the products securely'],
  [5, 'confirm_ready', 'Confirm the package is ready for dispatch'],
] as const;

export class PrismaInboxRepo implements InboxRepo {
  constructor(private db: PrismaClient) {}

  async insertIfAbsent(n: NewInboxItem): Promise<boolean> {
    const count = await this.db.$executeRaw`
      INSERT INTO webhook_inbox (shopify_webhook_id, shopify_event_id, topic, shop_domain, api_version,
                                 shopify_triggered_at, resource_id, payload)
      VALUES (${n.shopifyWebhookId}, ${n.shopifyEventId}, ${n.topic}, ${n.shopDomain}, ${n.apiVersion},
              ${n.shopifyTriggeredAt}, ${n.resourceId}, ${JSON.stringify(n.payload)}::jsonb)
      ON CONFLICT (shopify_webhook_id) DO NOTHING`;
    return count === 1;
  }

  // Prisma has no SKIP LOCKED syntax, so claiming is raw SQL (one atomic UPDATE ... RETURNING).
  async claimDue(now: Date, limit: number, leaseMs: number): Promise<InboxItem[]> {
    const lockedUntil = new Date(now.getTime() + leaseMs);
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        shopify_webhook_id: string;
        topic: string;
        shop_domain: string;
        resource_id: string | null;
        payload: unknown;
        status: InboxItem['status'];
        attempt_count: number;
        next_retry_at: Date;
        locked_until: Date | null;
      }>
    >`
      UPDATE webhook_inbox SET status = 'PROCESSING', locked_until = ${lockedUntil}
      WHERE id IN (
        SELECT id FROM webhook_inbox
        WHERE (status IN ('RECEIVED','FAILED') AND next_retry_at <= ${now})
           OR (status = 'PROCESSING' AND locked_until <= ${now})
        ORDER BY next_retry_at, received_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, shopify_webhook_id, topic, shop_domain, resource_id, payload, status, attempt_count, next_retry_at, locked_until`;
    return rows.map((r) => ({
      id: r.id,
      shopifyWebhookId: r.shopify_webhook_id,
      topic: r.topic,
      shopDomain: r.shop_domain,
      resourceId: r.resource_id,
      payload: r.payload,
      status: r.status,
      attemptCount: r.attempt_count,
      nextRetryAt: r.next_retry_at,
      lockedUntil: r.locked_until,
    }));
  }

  async markProcessed(id: string, now: Date) {
    await this.db.webhookInbox.update({ where: { id }, data: { status: 'PROCESSED', processedAt: now, lockedUntil: null } });
  }
  async markFailed(id: string, attemptCount: number, nextRetryAt: Date, code: string, message: string) {
    await this.db.webhookInbox.update({
      where: { id },
      data: { status: 'FAILED', attemptCount, nextRetryAt, lastErrorCode: code, lastErrorMessage: message, lockedUntil: null },
    });
  }
  async markDeadLetter(id: string, attemptCount: number, code: string, message: string) {
    await this.db.webhookInbox.update({
      where: { id },
      data: { status: 'DEAD_LETTER', attemptCount, lastErrorCode: code, lastErrorMessage: message, lockedUntil: null },
    });
  }
}

export class PrismaOrderRepo implements OrderRepo {
  constructor(private db: PrismaClient) {}

  async getByShopifyId(shopifyOrderId: string): Promise<StoredOrder | null> {
    const o = await this.db.order.findUnique({ where: { shopifyOrderId } });
    return o
      ? {
          id: o.id,
          lifecycleStatus: o.lifecycleStatus as LifecycleStatus,
          orderVersion: o.orderVersion,
          shopifyUpdatedAt: o.shopifyUpdatedAt,
        }
      : null;
  }

  async listActionableShopifyIds(): Promise<string[]> {
    const rows = await this.db.order.findMany({
      where: { lifecycleStatus: { in: ['PAID', 'PREPARING', 'DISPATCH_PENDING'] } },
      select: { shopifyOrderId: true },
    });
    return rows.map((r) => r.shopifyOrderId);
  }

  /** Snapshot, eligibility, lifecycle change and audit events commit in ONE transaction. */
  async applySync(w: SyncWrite): Promise<void> {
    const { order, evaluation, transition, isNew, now } = w;
    const snapshot = {
      shopifyOrderNumber: order.orderNumber,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      shopifyShippingAddress: (order.shippingAddress ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      currency: order.currency,
      subtotalAmount: new Prisma.Decimal(order.subtotalAmount),
      shippingAmount: new Prisma.Decimal(order.shippingAmount),
      totalAmount: new Prisma.Decimal(order.totalAmount),
      shopifyFinancialStatus: order.financialStatus,
      shopifyFulfillmentStatus: order.fulfillments.length > 0 ? 'FULFILLED' : null,
      shopifyCancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
      shopifyUpdatedAt: new Date(order.updatedAt),
      lastSyncedAt: now,
      eligibilityStatus: evaluation.status,
      eligibilityReasonCode: evaluation.status === 'INELIGIBLE' ? evaluation.reasonCode : null,
    };

    await this.db.$transaction(async (tx) => {
      const prev = await tx.order.findUnique({ where: { shopifyOrderId: order.shopifyOrderId } });
      const lifecycleData = transition
        ? {
            lifecycleStatus: transition.to,
            ...(prev ? { orderVersion: { increment: 1 } } : {}),
            // set-once: the database trigger also forbids rewriting it
            ...(transition.paymentVerifiedAt && !prev?.paymentVerifiedAt
              ? { paymentVerifiedAt: new Date(transition.paymentVerifiedAt) }
              : {}),
          }
        : {};
      const saved = prev
        ? await tx.order.update({ where: { id: prev.id }, data: { ...snapshot, ...lifecycleData } })
        : await tx.order.create({ data: { shopifyOrderId: order.shopifyOrderId, ...snapshot, ...lifecycleData } });

      // Items are upserted, never deleted: orderflow_app has no DELETE right (architecture 8.5).
      for (const li of order.lineItems) {
        const data = {
          productId: li.productId,
          variantId: li.variantId,
          productTitle: li.productTitle,
          variantTitle: li.variantTitle,
          sku: li.sku,
          quantity: li.quantity,
          unitPrice: new Prisma.Decimal(li.unitPrice),
          lineTotal: new Prisma.Decimal(li.lineTotal),
        };
        await tx.orderItem.upsert({
          where: { orderId_shopifyLineItemId: { orderId: saved.id, shopifyLineItemId: li.shopifyLineItemId } },
          update: data,
          create: { orderId: saved.id, shopifyLineItemId: li.shopifyLineItemId, ...data },
        });
      }

      if (!prev) {
        await tx.checklistStep.createMany({
          data: CHECKLIST.map(([stepNumber, stepKey, label]) => ({ orderId: saved.id, stepNumber, stepKey, label })),
        });
        await tx.auditEvent.create({ data: { orderId: saved.id, actorType: 'SHOPIFY', eventType: 'ORDER_IMPORTED', details: {} } });
      }
      if (
        prev &&
        (prev.eligibilityStatus !== snapshot.eligibilityStatus || prev.eligibilityReasonCode !== snapshot.eligibilityReasonCode)
      ) {
        await tx.auditEvent.create({
          data: {
            orderId: saved.id,
            actorType: 'SYSTEM',
            eventType: 'ELIGIBILITY_CHANGED',
            details: { to: snapshot.eligibilityStatus, reason: snapshot.eligibilityReasonCode },
          },
        });
      }
      if (transition && (!prev || prev.lifecycleStatus !== transition.to)) {
        await tx.auditEvent.create({
          data: {
            orderId: saved.id,
            actorType: 'SYSTEM',
            eventType: 'ORDER_LIFECYCLE_CHANGED',
            details: { from: prev?.lifecycleStatus ?? null, to: transition.to },
          },
        });
      }
    });
  }

  /** Rows for the order list. The pure `selectOrders` function applies filters, search and paging. */
  async listRows(staleAfterMinutes: number, now: Date): Promise<OrderListRow[]> {
    const staleBefore = new Date(now.getTime() - staleAfterMinutes * 60_000);
    const orders = await this.db.order.findMany({
      select: {
        id: true,
        shopifyOrderId: true,
        shopifyOrderNumber: true,
        customerName: true,
        lifecycleStatus: true,
        eligibilityStatus: true,
        eligibilityReasonCode: true,
        lastSyncedAt: true,
        shopifyConflictFlag: true,
        shopifyConflictReviewedAt: true,
        createdAt: true,
        dispatches: { select: { status: true, trackingNumber: true } },
        refunds: { select: { id: true }, take: 1 },
      },
    });
    const dead = await this.db.webhookInbox.findMany({ where: { status: 'DEAD_LETTER' }, select: { resourceId: true } });
    const deadIds = new Set(dead.map((d) => d.resourceId));
    return orders.map(
      (o): OrderListRow => ({
        id: o.id,
        orderNumber: o.shopifyOrderNumber,
        customerName: o.customerName,
        lifecycleStatus: o.lifecycleStatus as OrderListRow['lifecycleStatus'],
        eligibilityStatus: o.eligibilityStatus as OrderListRow['eligibilityStatus'],
        eligibilityReason: o.eligibilityReasonCode as OrderListRow['eligibilityReason'],
        trackingNumber: o.dispatches.find((d) => d.status === 'SUCCEEDED')?.trackingNumber ?? null,
        isStale: o.lastSyncedAt < staleBefore,
        hasPendingConfirmation: o.dispatches.some((d) => d.status === 'PENDING_CONFIRMATION'),
        hasDeadLetter: deadIds.has(o.shopifyOrderId),
        conflictFlag: o.shopifyConflictFlag,
        conflictReviewed: o.shopifyConflictReviewedAt !== null,
        hasRefundApplication: o.refunds.length > 0,
        createdAt: o.createdAt,
      }),
    );
  }
}

export class PrismaAudit implements AuditSink {
  constructor(private db: PrismaClient) {}
  async record(e: {
    eventType: string;
    actorType: 'USER' | 'SYSTEM' | 'SHOPIFY';
    shopifyOrderId?: string;
    details: Record<string, unknown>;
  }) {
    const order = e.shopifyOrderId
      ? await this.db.order.findUnique({ where: { shopifyOrderId: e.shopifyOrderId }, select: { id: true } })
      : null;
    await this.db.auditEvent.create({
      data: { orderId: order?.id ?? null, actorType: e.actorType, eventType: e.eventType, details: e.details as Prisma.InputJsonValue },
    });
  }
}
