import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export interface StoredResult {
  payloadHash: string;
  responseStatus: number;
  responseBody: Prisma.JsonValue;
}

/** Stable JSON: object keys sorted, so key order never changes the hash. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export async function findStoredResult(
  transaction: Prisma.TransactionClient,
  actorId: string,
  requestId: string
): Promise<StoredResult | null> {
  const row = await transaction.idempotencyKey.findUnique({
    where: { actorId_requestId: { actorId, requestId } }
  });
  if (!row) return null;
  return {
    payloadHash: row.payloadHash,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody
  };
}

/**
 * Serialises concurrent requests that share a key for this transaction, so
 * duplicates wait for the first commit and then replay its stored result.
 */
export async function lockKey(
  transaction: Prisma.TransactionClient,
  actorId: string,
  requestId: string
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actorId}:${requestId}`}, 0))`;
}

export async function storeResult(
  transaction: Prisma.TransactionClient,
  input: {
    actorId: string;
    requestId: string;
    payloadHash: string;
    responseStatus: number;
    responseBody: Prisma.InputJsonValue;
  }
): Promise<void> {
  await transaction.idempotencyKey.create({
    data: {
      actorId: input.actorId,
      requestId: input.requestId,
      payloadHash: input.payloadHash,
      responseStatus: input.responseStatus,
      responseBody: input.responseBody
    }
  });
}
