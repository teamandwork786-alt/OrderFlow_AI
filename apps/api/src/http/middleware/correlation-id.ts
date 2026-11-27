import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function correlationId(
  _request: Request,
  response: Response,
  next: NextFunction
): void {
  response.locals.correlationId = randomUUID();
  response.setHeader("X-Correlation-Id", response.locals.correlationId);
  next();
}
