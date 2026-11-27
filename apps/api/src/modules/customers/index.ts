import type { Prisma } from "@prisma/client";
import type { CustomerOrder } from "@orderflow/shared";

/**
 * Customer reads (AGENTS 5.9): every query filters customer_user_id = actor
 * in SQL and returns the customer DTO only. Never reuse for staff routes.
 */
const orderSelect = {
  id: true,
  orderNumber: true,
  lifecycleStatus: true,
  createdAt: true,
  subtotalPkr: true,
  deliveryChargePkr: true,
  totalPkr: true,
  recipientName: true,
  recipientPhone: true,
  deliveryAddress: true,
  orderNote: true,
  items: {
    orderBy: { productTitle: "asc" },
    select: {
      productTitle: true,
      productSku: true,
      quantity: true,
      unitPricePkr: true,
      lineTotalPkr: true
    }
  }
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function toDto(row: OrderRow): CustomerOrder {
  return {
    order_number: row.orderNumber,
    lifecycle_status: row.lifecycleStatus as CustomerOrder["lifecycle_status"],
    created_at: row.createdAt.toISOString(),
    subtotal_pkr: row.subtotalPkr.toFixed(2),
    delivery_charge_pkr: row.deliveryChargePkr.toFixed(2),
    total_pkr: row.totalPkr.toFixed(2),
    recipient_name: row.recipientName,
    recipient_phone: row.recipientPhone,
    delivery_address: row.deliveryAddress,
    note: row.orderNote,
    items: row.items.map((item) => ({
      product_title: item.productTitle,
      product_sku: item.productSku,
      quantity: item.quantity,
      unit_price: item.unitPricePkr.toFixed(2),
      line_total: item.lineTotalPkr.toFixed(2)
    }))
  };
}

export async function getOwnOrderById(
  transaction: Prisma.TransactionClient,
  customerId: string,
  orderId: string
): Promise<CustomerOrder | null> {
  const row = await transaction.order.findFirst({
    where: { id: orderId, customerUserId: customerId },
    select: orderSelect
  });
  return row ? toDto(row) : null;
}

export async function getOwnOrderByNumber(
  transaction: Prisma.TransactionClient,
  customerId: string,
  orderNumber: string
): Promise<CustomerOrder | null> {
  const row = await transaction.order.findFirst({
    where: { orderNumber, customerUserId: customerId },
    select: orderSelect
  });
  return row ? toDto(row) : null;
}

export async function listOwnOrders(
  transaction: Prisma.TransactionClient,
  customerId: string,
  page: number,
  pageSize: number
): Promise<{ items: CustomerOrder[]; total: number }> {
  const where = { customerUserId: customerId };
  const [rows, total] = await Promise.all([
    transaction.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: orderSelect
    }),
    transaction.order.count({ where })
  ]);
  return { items: rows.map(toDto), total };
}
