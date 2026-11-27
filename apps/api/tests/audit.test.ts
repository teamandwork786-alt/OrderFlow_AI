import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

type AuditModule = {
  createAuditEvent: (
    transaction: unknown,
    event: {
      eventType: string;
      actorType: "USER" | "SYSTEM";
      actorId?: string;
      details: Record<string, unknown>;
      correlationId: string;
    }
  ) => Promise<void>;
};

async function loadAuditModule(): Promise<AuditModule> {
  const modulePath = new URL("../src/modules/audit/index.js", import.meta.url)
    .href;
  return (await import(modulePath)) as AuditModule;
}

describe("Slice 1A audit contract", () => {
  it("1A-06 writes the audit event in the caller's transaction", async () => {
    const { createAuditEvent } = await loadAuditModule();
    const prismaPath = new URL("../src/db/prisma.js", import.meta.url).href;
    const { prisma } = (await import(prismaPath)) as {
      prisma: {
        $transaction: <T>(
          callback: (transaction: unknown) => Promise<T>
        ) => Promise<T>;
        auditEvent: { count: () => Promise<number> };
      };
    };
    const before = await prisma.auditEvent.count();

    await prisma.$transaction((transaction) =>
      createAuditEvent(transaction, {
        eventType: "CUSTOMER_PROVISIONED",
        actorType: "SYSTEM",
        details: { user_id: randomUUID() },
        correlationId: "correlation-committed"
      })
    );
    const afterCommit = await prisma.auditEvent.count();
    expect(afterCommit).toBe(before + 1);

    await expect(
      prisma.$transaction(async (transaction) => {
        await createAuditEvent(transaction, {
          eventType: "CUSTOMER_PROVISIONED",
          actorType: "SYSTEM",
          details: { user_id: randomUUID() },
          correlationId: "correlation-1"
        });
        throw new Error("force transaction rollback");
      })
    ).rejects.toThrow("force transaction rollback");
    expect(await prisma.auditEvent.count()).toBe(afterCommit);
  });

  it("1A-08 rejects audit details outside the per-event allowlist", async () => {
    const { createAuditEvent } = await loadAuditModule();
    const prismaPath = new URL("../src/db/prisma.js", import.meta.url).href;
    const { prisma } = (await import(prismaPath)) as {
      prisma: {
        $transaction: <T>(
          callback: (transaction: unknown) => Promise<T>
        ) => Promise<T>;
      };
    };

    const before = await prisma.auditEvent.count();
    await expect(
      prisma.$transaction((transaction) =>
        createAuditEvent(transaction, {
          eventType: "CUSTOMER_PROVISIONED",
          actorType: "SYSTEM",
          details: { user_id: randomUUID(), address: "private address" },
          correlationId: "correlation-2"
        })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await prisma.auditEvent.count()).toBe(before);
  });
});
