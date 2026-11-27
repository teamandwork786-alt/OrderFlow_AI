import { Router } from "express";
import { z } from "zod";
import {
  canPerformStep,
  landingPathForRoles,
  OidcCallbackQuerySchema,
  SignInQuerySchema
} from "@orderflow/shared";
import type { AppConfig } from "../../config.js";
import { prisma } from "../../db/prisma.js";
import { createAuditEvent } from "../../modules/audit/index.js";
import {
  OidcIssuerAdapter,
  createPendingLogin
} from "../../modules/auth/oidc-adapter.js";
import {
  csrfTokensMatch,
  sessionCookieName,
  sessionCookieOptions,
  sessionStore
} from "../../modules/auth/session.js";
import { DomainError } from "../../modules/errors/domain-error.js";
import {
  getUserIdentity,
  provisionUserFromOidcClaims
} from "../../modules/users/service.js";
import { requireSession } from "../middleware/require-session.js";

// Unknown or missing values fall back to the customer portal.
const PortalSchema = z.enum(["customer", "staff"]).catch("customer");

const STATE_COOKIE = "orderflow_oidc_state";
const STATE_COOKIE_TTL = 5 * 60 * 1000;

interface AuthDependencies {
  config: AppConfig;
}

export function createAuthRouter({ config }: AuthDependencies): Router {
  const router = Router();
  const issuer = new OidcIssuerAdapter(config);
  const pendingLogins = new Map<
    string,
    ReturnType<typeof createPendingLogin>
  >();
  const authCookieOptions = {
    httpOnly: true,
    secure: config.SESSION_COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/"
  };

  router.get("/auth/oidc/sign-in", async (request, response) => {
    const query = SignInQuerySchema.parse(request.query);
    const returnTo = normalizeReturnTo(query.return_to);
    const portal = PortalSchema.parse(request.query.portal);
    const pending = createPendingLogin(returnTo, portal);
    pendingLogins.set(pending.state, pending);
    response.cookie(STATE_COOKIE, pending.state, {
      ...authCookieOptions,
      maxAge: STATE_COOKIE_TTL
    });
    response.redirect(
      (await issuer.createAuthorizationUrl(pending)).toString()
    );
  });

  router.get("/auth/oidc/callback", async (request, response, next) => {
    const query = OidcCallbackQuerySchema.parse(request.query);
    const cookieState: unknown = request.cookies?.[STATE_COOKIE];
    if (typeof cookieState !== "string" || cookieState !== query.state) {
      await auditSignInFailure("INVALID_STATE", response.locals.correlationId);
      next(
        new DomainError(
          "INVALID_OIDC_STATE",
          "The sign-in response could not be verified.",
          401
        )
      );
      return;
    }

    const pending = pendingLogins.get(query.state);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingLogins.delete(query.state);
      await auditSignInFailure("INVALID_STATE", response.locals.correlationId);
      next(
        new DomainError(
          "INVALID_OIDC_STATE",
          "The sign-in response could not be verified.",
          401
        )
      );
      return;
    }
    pendingLogins.delete(query.state);

    try {
      const claims = await issuer.verifyAuthorizationCode(query.code, pending);
      const identity = await provisionUserFromOidcClaims(
        claims,
        prisma,
        response.locals.correlationId
      );
      await prisma.$transaction((transaction) =>
        createAuditEvent(transaction, {
          eventType: "SIGN_IN_SUCCEEDED",
          actorType: "USER",
          actorId: identity.id,
          details: { user_id: identity.id },
          correlationId: response.locals.correlationId
        })
      );

      const session = sessionStore.create(identity.id, config.SESSION_SECRET);
      response.cookie(
        sessionCookieName,
        session.sessionId,
        sessionCookieOptions(config)
      );
      response.clearCookie(STATE_COOKIE, authCookieOptions);
      response.redirect(
        new URL(pending.returnTo, config.WEB_ORIGIN).toString()
      );
    } catch (error) {
      if (error instanceof DomainError) {
        await auditSignInFailure(
          error.code === "OIDC_UNAVAILABLE"
            ? "ISSUER_ERROR"
            : "INVALID_ID_TOKEN",
          response.locals.correlationId
        );
        next(error);
        return;
      }
      next(error);
    }
  });

  router.get("/auth/csrf", requireSession, (_request, response) => {
    const context = response.locals.authenticated;
    if (!context) {
      throw new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401);
    }
    response.json({ csrf_token: context.session.csrfToken });
  });

  router.post(
    "/auth/sign-out",
    requireSession,
    async (request, response, next) => {
      const context = response.locals.authenticated;
      if (!context) {
        next(new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401));
        return;
      }
      const csrfHeader = request.header("X-CSRF-Token");
      if (!csrfTokensMatch(context.session.csrfToken, csrfHeader)) {
        next(
          new DomainError(
            "CSRF_INVALID",
            "A valid CSRF token is required.",
            403
          )
        );
        return;
      }

      await prisma.$transaction(async (transaction) => {
        await createAuditEvent(transaction, {
          eventType: "SIGN_OUT",
          actorType: "USER",
          actorId: context.actor.id,
          details: { user_id: context.actor.id },
          correlationId: response.locals.correlationId
        });
      });
      const cookieValue: unknown = request.cookies?.[sessionCookieName];
      if (typeof cookieValue === "string") sessionStore.delete(cookieValue);
      response.clearCookie(sessionCookieName, sessionCookieOptions(config));
      response.status(204).end();
    }
  );

  router.get("/me", requireSession, async (_request, response) => {
    const context = response.locals.authenticated;
    if (!context) {
      throw new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401);
    }
    const identity = await getUserIdentity(context.actor.id);
    if (!identity || identity.roles.length === 0) {
      throw new DomainError("UNAUTHENTICATED", "Sign-in is required.", 401);
    }

    const adminCanPerformStaffTasks = false;
    const permissions = identity.permissions.filter(
      (permission) =>
        adminCanPerformStaffTasks ||
        !identity.roles.includes("admin") ||
        (permission !== "checklist.steps_1_2" &&
          permission !== "checklist.steps_3_5")
    );
    const allowedChecklistSteps = [1, 2, 3, 4, 5].filter((step) =>
      canPerformStep(identity.roles, step, adminCanPerformStaffTasks)
    );

    response.json({
      id: identity.id,
      name: identity.name,
      roles: identity.roles,
      permissions,
      allowed_checklist_steps: allowedChecklistSteps,
      flags: { admin_can_perform_staff_tasks: adminCanPerformStaffTasks },
      landing_path: landingPathForRoles(identity.roles)
    });
  });

  return router;

  async function auditSignInFailure(
    reason: "INVALID_STATE" | "INVALID_ID_TOKEN" | "ISSUER_ERROR",
    correlationId: string
  ): Promise<void> {
    await prisma.$transaction((transaction) =>
      createAuditEvent(transaction, {
        eventType: "SIGN_IN_FAILED",
        actorType: "SYSTEM",
        details: { reason },
        correlationId
      })
    );
  }
}

function normalizeReturnTo(value: string | undefined): string {
  if (!value) return "/";
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    throw new DomainError(
      "INVALID_RETURN_TO",
      "The sign-in destination is invalid.",
      400
    );
  }
  const parsed = new URL(value, "http://orderflow.local");
  if (parsed.origin !== "http://orderflow.local") {
    throw new DomainError(
      "INVALID_RETURN_TO",
      "The sign-in destination is invalid.",
      400
    );
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
