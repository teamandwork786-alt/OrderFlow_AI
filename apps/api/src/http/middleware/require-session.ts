import type { NextFunction, Request, Response } from "express";
import { getUserIdentity } from "../../modules/users/service.js";
import { DomainError } from "../../modules/errors/domain-error.js";
import { sessionCookieName, sessionStore } from "../../modules/auth/session.js";
import type { UserIdentity } from "../../modules/users/service.js";
import type { SessionRecord } from "../../modules/auth/session.js";
import { config } from "../../config.js";

export interface AuthenticatedContext {
  actor: UserIdentity;
  session: SessionRecord;
}

export async function requireSession(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  const sessionId: unknown = request.cookies?.[sessionCookieName];
  if (typeof sessionId !== "string") {
    next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
    return;
  }

  const session = sessionStore.get(sessionId, config.SESSION_SECRET);
  if (!session) {
    next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
    return;
  }

  const actor = await getUserIdentity(session.userId);
  if (!actor || actor.roles.length === 0) {
    sessionStore.delete(sessionId);
    next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
    return;
  }
  const permissions = actor.permissions.filter(
    (permission) =>
      !actor.roles.includes("admin") ||
      (permission !== "checklist.steps_1_2" &&
        permission !== "checklist.steps_3_5")
  );
  response.locals.authenticated = {
    actor: { ...actor, permissions },
    session
  };
  next();
}
