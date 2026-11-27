import type { Response } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "../../config.js";
import { DomainError } from "../../modules/errors/domain-error.js";

/** Order creation is limited per signed-in user, never per IP. */
export function createOrderRateLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.ORDER_RATE_LIMIT_PER_HOUR,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_request, response: Response) =>
      String(response.locals.authenticated?.actor.id ?? "anonymous"),
    handler: (_request, _response, next) => {
      next(
        new DomainError(
          "RATE_LIMITED",
          "Too many orders. Please try again later.",
          429
        )
      );
    }
  });
}
