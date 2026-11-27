import type { AuthenticatedContext } from "../http/middleware/require-session.js";

declare global {
  namespace Express {
    interface Locals {
      correlationId: string;
      authenticated?: AuthenticatedContext;
    }
  }
}
