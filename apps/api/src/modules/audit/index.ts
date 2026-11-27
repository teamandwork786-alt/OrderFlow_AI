import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "../errors/domain-error.js";

const eventDetails = {
  CUSTOMER_PROVISIONED: z.object({ user_id: z.string().uuid() }).strict(),
  SIGN_IN_SUCCEEDED: z.object({ user_id: z.string().uuid() }).strict(),
  SIGN_IN_FAILED: z
    .object({
      reason: z.enum(["INVALID_STATE", "INVALID_ID_TOKEN", "ISSUER_ERROR"])
    })
    .strict(),
  SIGN_OUT: z.object({ user_id: z.string().uuid() }).strict(),
  ROLE_ASSIGNED: z
    .object({ user_id: z.string().uuid(), role: z.string().min(1).max(50) })
    .strict(),
  ORDER_CREATED: z
    .object({
      order_id: z.string().uuid(),
      order_number: z.string().regex(/^OF-[0-9]{6,}$/),
      source: z.enum(["STOREFRONT", "MANUAL"]),
      line_count: z.number().int().min(1)
    })
    .strict(),
  PERMISSION_DENIED: z
    .object({
      permission: z.string().min(1).max(100),
      route: z.string().min(1).max(200)
    })
    .strict()
} satisfies Record<string, z.ZodType>;

export type AuditEventType = keyof typeof eventDetails;

export interface AuditEventInput {
  eventType: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string;
  details: Record<string, unknown>;
  correlationId: string;
}

export async function createAuditEvent(
  transaction: Prisma.TransactionClient,
  input: AuditEventInput
): Promise<void> {
  if (!Object.hasOwn(eventDetails, input.eventType)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Audit details are invalid.",
      400
    );
  }

  const schema = eventDetails[input.eventType as AuditEventType];
  const parsed = schema.safeParse(input.details);
  if (!parsed.success) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Audit details are invalid.",
      400
    );
  }

  await transaction.auditEvent.create({
    data: {
      eventType: input.eventType,
      actorType: input.actorType,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      details: parsed.data as Prisma.InputJsonValue,
      correlationId: input.correlationId
    }
  });
}
