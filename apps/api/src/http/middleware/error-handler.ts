import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { DomainError } from "../../modules/errors/domain-error.js";
import { logger } from "../../observability/logger.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next
) => {
  void _next;
  const correlationId = response.locals.correlationId ?? "unknown";
  if (error instanceof DomainError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        correlation_id: correlationId
      }
    });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        correlation_id: correlationId
      }
    });
    return;
  }

  if (isPayloadTooLarge(error)) {
    response.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the allowed size.",
        correlation_id: correlationId
      }
    });
    return;
  }

  logger.error(
    { correlation_id: correlationId, error_name: getErrorName(error) },
    "request failed"
  );
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      correlation_id: correlationId
    }
  });
};

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
