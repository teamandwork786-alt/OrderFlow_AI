import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CreateOrderBody, CustomerOrder } from "@orderflow/shared";
import { config } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { createAuditEvent } from "../audit/index.js";
import { getOwnOrderById } from "../customers/index.js";
import { DomainError } from "../errors/domain-error.js";
import {
  findStoredResult,
  hashPayload,
  lockKey,
  storeResult
} from "../idempotency/index.js";
import { lockProductsForShare } from "../products/index.js";
import { heldProductIds } from "../stock/index.js";

interface Actor {
  id: string;
}

const ORDER_CHECKLIST_STEPS = [1, 2, 3, 4, 5] as const;

/**
 * Customer places a storefront order. The server prices everything; the
 * client's expected_total is only a consent check (AGENTS section 6).
 */
export async function createStorefrontOrder(
  actor: Actor,
  body: CreateOrderBody,
  correlationId: string
): Promise<CustomerOrder> {
  const payloadHash = hashPayload(body);
  return prisma.$transaction(async (transaction) => {
    await lockKey(transaction, actor.id, body.request_id);
    const stored = await findStoredResult(
      transaction,
      actor.id,
      body.request_id
    );
    if (stored) {
      if (stored.payloadHash !== payloadHash) {
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "This request id was already used with different details.",
          409
        );
      }
      const replay = await replayStored(
        transaction,
        actor.id,
        stored.responseBody
      );
      if (!replay) {
        // The key exists but its order cannot be read back for this user.
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "This request id was already used and its result is unavailable.",
          409
        );
      }
      return replay;
    }

    const requestedIds = [
      ...new Set(body.items.map((item) => item.product_id))
    ].sort();
    const products = await lockProductsForShare(transaction, requestedIds);
    const held = await heldProductIds(transaction, requestedIds);
    const byId = new Map(products.map((product) => [product.id, product]));
    const unavailable = requestedIds.filter((id) => {
      const product = byId.get(id);
      return !product || product.availability !== "AVAILABLE" || held.has(id);
    });
    if (unavailable.length > 0) {
      throw new DomainError(
        "PRODUCT_UNAVAILABLE",
        "One or more products are no longer available.",
        422,
        { product_ids: unavailable }
      );
    }

    const lines = body.items.map((item) => {
      const product = byId.get(item.product_id);
      if (!product) throw new Error("Locked product disappeared.");
      return {
        product,
        quantity: item.quantity,
        lineTotal: product.pricePkr.mul(item.quantity)
      };
    });
    const subtotal = lines.reduce(
      (sum, line) => sum.add(line.lineTotal),
      new Prisma.Decimal(0)
    );
    const delivery = new Prisma.Decimal(config.DELIVERY_CHARGE_PKR);
    const total = subtotal.add(delivery);
    if (!new Prisma.Decimal(body.expected_total).equals(total)) {
      throw new DomainError(
        "PRICE_CHANGED",
        "Prices have changed since you added these items.",
        409,
        { current_total: total.toFixed(2) }
      );
    }

    const created = await transaction.order.create({
      data: {
        publicToken: randomBytes(16).toString("hex"),
        source: "STOREFRONT",
        customerUserId: actor.id,
        recipientName: body.recipient_name,
        recipientPhone: body.phone,
        recipientEmail: body.email,
        deliveryAddress: body.delivery_address,
        orderNote: body.note ?? null,
        subtotalPkr: subtotal,
        deliveryChargePkr: delivery,
        totalPkr: total,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            productTitle: line.product.title,
            productSku: line.product.sku,
            quantity: line.quantity,
            unitPricePkr: line.product.pricePkr,
            lineTotalPkr: line.lineTotal
          }))
        },
        checklistSteps: {
          create: ORDER_CHECKLIST_STEPS.map((stepNumber) => ({ stepNumber }))
        }
      },
      select: { id: true, orderNumber: true }
    });
    await createAuditEvent(transaction, {
      eventType: "ORDER_CREATED",
      actorType: "USER",
      actorId: actor.id,
      details: {
        order_id: created.id,
        order_number: created.orderNumber,
        source: "STOREFRONT",
        line_count: lines.length
      },
      correlationId
    });
    await storeResult(transaction, {
      actorId: actor.id,
      requestId: body.request_id,
      payloadHash,
      responseStatus: 201,
      responseBody: { order_id: created.id, order_number: created.orderNumber }
    });
    const dto = await getOwnOrderById(transaction, actor.id, created.id);
    if (!dto) throw new Error("Created order could not be read back.");
    return dto;
  });
}

async function replayStored(
  transaction: Prisma.TransactionClient,
  actorId: string,
  responseBody: Prisma.JsonValue
): Promise<CustomerOrder | null> {
  if (
    responseBody === null ||
    typeof responseBody !== "object" ||
    Array.isArray(responseBody) ||
    typeof responseBody.order_id !== "string"
  ) {
    return null;
  }
  return getOwnOrderById(transaction, actorId, responseBody.order_id);
}
