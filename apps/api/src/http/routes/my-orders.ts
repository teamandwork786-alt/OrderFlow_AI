import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import {
  getOwnOrderByNumber,
  listOwnOrders
} from "../../modules/customers/index.js";
import { DomainError } from "../../modules/errors/domain-error.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireSession } from "../middleware/require-session.js";

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20)
});
const OrderNumberSchema = z.string().regex(/^OF-[0-9]{6,}$/);

function notFound(): DomainError {
  return new DomainError("ORDER_NOT_FOUND", "Order not found.", 404);
}

export function createMyOrdersRouter(): Router {
  const router = Router();
  router.use(
    "/my/orders",
    requireSession,
    requirePermission("customer.order.read_own")
  );

  router.get("/my/orders", async (request, response) => {
    const query = ListQuerySchema.parse(request.query);
    const customerId = response.locals.authenticated?.actor.id;
    if (!customerId) throw notFound();
    const result = await prisma.$transaction((transaction) =>
      listOwnOrders(transaction, customerId, query.page, query.page_size)
    );
    response.json({ ...result, page: query.page, page_size: query.page_size });
  });

  router.get("/my/orders/:orderNumber", async (request, response) => {
    const orderNumber = OrderNumberSchema.safeParse(request.params.orderNumber);
    const customerId = response.locals.authenticated?.actor.id;
    if (!orderNumber.success || !customerId) throw notFound();
    const order = await prisma.$transaction((transaction) =>
      getOwnOrderByNumber(transaction, customerId, orderNumber.data)
    );
    if (!order) throw notFound();
    response.json(order);
  });
  return router;
}
