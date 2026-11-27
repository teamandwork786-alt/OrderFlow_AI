import { z } from "zod";
import { Prisma, PrismaClient } from "@prisma/client";

const SeedEnvironmentSchema = z.object({
  DATABASE_URL_OWNER: z.url(),
  ALLOW_DESTRUCTIVE_SEED: z.literal("true"),
  BOOTSTRAP_OWNER_SUBJECT: z.string().min(1).default("demo-owner")
});

const DemoUsers = [
  {
    subject: "demo-admin",
    name: "OrderFlow Admin",
    email: "admin@example.test",
    role: "admin"
  },
  {
    subject: "demo-staff-picker-packer",
    name: "Picker Packer",
    email: "picker@example.test",
    role: "staff_picker_packer"
  },
  {
    subject: "demo-staff-inspector",
    name: "Inspector",
    email: "inspector@example.test",
    role: "staff_inspector"
  },
  {
    subject: "demo-staff-full",
    name: "Full Staff",
    email: "staff@example.test",
    role: "staff_full"
  },
  {
    subject: "demo-customer-a",
    name: "Customer A",
    email: "customer-a@example.test",
    role: "customer"
  },
  {
    subject: "demo-customer-b",
    name: "Customer B",
    email: "customer-b@example.test",
    role: "customer"
  }
] as const;

const parsed = SeedEnvironmentSchema.safeParse(process.env);
if (!parsed.success) {
  process.stderr.write(
    "Seed requires DATABASE_URL_OWNER and ALLOW_DESTRUCTIVE_SEED=true. No data was changed.\n"
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Seed will upsert the Owner and six demo identities in the configured database.\n"
  );
  process.env.DATABASE_URL = parsed.data.DATABASE_URL_OWNER;
  const prisma = new PrismaClient();
  try {
    const ownerSubject = parsed.data.BOOTSTRAP_OWNER_SUBJECT;
    await prisma.$transaction(async (transaction) => {
      await upsertDemoUser(transaction, {
        subject: ownerSubject,
        name: "OrderFlow Owner",
        email: "owner@example.test",
        role: "owner"
      });
      for (const demoUser of DemoUsers) {
        await upsertDemoUser(transaction, demoUser);
      }
    });
    process.stdout.write("Demo identity seed completed.\n");
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(
      `Demo identity seed failed (${errorName}); no success was recorded.\n`
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function upsertDemoUser(
  transaction: Prisma.TransactionClient,
  user: { subject: string; name: string; email: string; role: string }
): Promise<void> {
  const result = await transaction.user.upsert({
    where: { oidcSubject: user.subject },
    create: { oidcSubject: user.subject, name: user.name, email: user.email },
    update: { name: user.name, email: user.email, updatedAt: new Date() }
  });
  await transaction.userRole.createMany({
    data: [{ userId: result.id, roleId: user.role }],
    skipDuplicates: true
  });
}
