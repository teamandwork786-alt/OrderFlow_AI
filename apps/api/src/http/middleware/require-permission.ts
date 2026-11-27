import type { NextFunction, Request, Response } from "express";
import { hasPermission } from "@orderflow/shared";
import { prisma } from "../../db/prisma.js";
import { createAuditEvent } from "../../modules/audit/index.js";
import { DomainError } from "../../modules/errors/domain-error.js";

export function requirePermission(permission: string) {
  return async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const context = response.locals.authenticated;
    if (!context) {
      next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
      return;
    }
    if (!hasPermission(context.actor.permissions, permission)) {
      await prisma.$transaction((transaction) =>
        createAuditEvent(transaction, {
          eventType: "PERMISSION_DENIED",
          actorType: "USER",
          actorId: context.actor.id,
          details: {
            permission,
            route: _request.route?.path?.toString() ?? _request.path
          },
          correlationId: response.locals.correlationId
        })
      );
      next(
        new DomainError(
          "FORBIDDEN",
          "You do not have permission to perform this action.",
          403
        )
      );
      return;
    }
    next();
  };
}
