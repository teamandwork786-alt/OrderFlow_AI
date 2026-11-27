import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { PermissionKeySchema } from "@orderflow/shared";
import { config } from "./config.js";
import { prisma } from "./db/prisma.js";
import { DomainError } from "./modules/errors/domain-error.js";
import { logger } from "./observability/logger.js";
import { correlationId } from "./http/middleware/correlation-id.js";
import { errorHandler } from "./http/middleware/error-handler.js";
import { requirePermission } from "./http/middleware/require-permission.js";
import { requireSession } from "./http/middleware/require-session.js";
import { createAuthRouter } from "./http/routes/auth.js";

export function createApp(): Application {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(correlationId);
  app.use((request, response, next) => {
    response.on("finish", () => {
      logger.info(
        {
          correlation_id: response.locals.correlationId,
          method: request.method,
          status: response.statusCode
        },
        "http request completed"
      );
    });
    next();
  });
  app.use(express.json({ limit: "100kb" }));

  const healthLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
  });
  app.use("/health", healthLimiter);
  // Keep the callback's expected redirect separate from sign-in attempt limits.
  app.use("/api/v1/auth/oidc/sign-in", createOidcRateLimiter());
  app.use("/api/v1/auth/oidc/callback", createOidcRateLimiter());

  app.get("/health", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.status(200).json({ status: "ok", database: "ok" });
    } catch {
      logger.error(
        { correlation_id: response.locals.correlationId },
        "health database check failed"
      );
      response
        .status(503)
        .json({ status: "degraded", database: "unavailable" });
    }
  });

  app.use("/api/v1", createAuthRouter({ config }));

  if (config.NODE_ENV === "test") {
    app.get(
      "/api/v1/test/permissions/:permission",
      requireSession,
      (request: Request, response: Response, next: NextFunction) => {
        const permission = PermissionKeySchema.safeParse(
          request.params.permission
        );
        if (!permission.success) {
          next(new DomainError("NOT_FOUND", "Route was not found.", 404));
          return;
        }
        void requirePermission(permission.data)(request, response, next);
      },
      (_request, response) => {
        response.json({ authorized: true });
      }
    );
  }

  app.use((_request, _response, next) => {
    next(new DomainError("NOT_FOUND", "Route was not found.", 404));
  });
  app.use(errorHandler);
  return app;
}

function createOidcRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false
  });
}
