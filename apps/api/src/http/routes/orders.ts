import { Router } from "express";
import { CreateOrderBodySchema } from "@orderflow/shared";
import { createOrderRateLimiter } from "../middleware/order-rate-limit.js";
import { requireCsrf } from "../middleware/require-csrf.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireSession } from "../middleware/require-session.js";
import { DomainError } from "../../modules/errors/domain-error.js";
import { createStorefrontOrder } from "../../modules/orders/index.js";

export function createOrdersRouter(): Router {
  const router = Router();
  router.post(
    "/orders",
    requireSession,
    requireCsrf,
    requirePermission("customer.order.create"),
    createOrderRateLimiter(),
    async (request, response) => {
      const context = response.locals.authenticated;
      if (!context) {
        throw new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401);
      }
      const body = CreateOrderBodySchema.parse(request.body);
      const order = await createStorefrontOrder(
        context.actor,
        body,
        response.locals.correlationId
      );
      response.status(201).json(order);
    }
  );
  return router;
}
