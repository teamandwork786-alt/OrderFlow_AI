import type { NextFunction, Request, Response } from "express";
import { csrfTokensMatch } from "../../modules/auth/session.js";
import { DomainError } from "../../modules/errors/domain-error.js";

/** Runs after requireSession; every state-changing route uses it. */
export function requireCsrf(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const context = response.locals.authenticated;
  if (!context) {
    next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
    return;
  }
  if (
    !csrfTokensMatch(context.session.csrfToken, request.header("X-CSRF-Token"))
  ) {
    next(
      new DomainError("CSRF_INVALID", "A valid CSRF token is required.", 403)
    );
    return;
  }
  next();
}
