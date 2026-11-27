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

/** Ghar ki Ronak catalogue. Descriptions are neutral drafts for human review. */
const SeedProducts = [
  {
    sku: "GKR-MIR-001",
    title: "Wavy Full-Length Golden Arch Mirror",
    category: "Mirrors",
    price: "14500.00",
    finish: "Hand-Burnished Antique Brass",
    cm: [165, 65, 4],
    description:
      "A tall arched mirror with a softly waved brass frame, made to lean against a wall or hang in an entrance."
  },
  {
    sku: "GKR-MIR-002",
    title: "Arched Brass Vanity Table Mirror",
    category: "Mirrors",
    price: "5800.00",
    finish: "Brushed Champagne Gold",
    cm: [42, 28, 12],
    description:
      "A compact arched mirror on a small brass stand, sized for a dressing table or shelf."
  },
  {
    sku: "GKR-LMP-001",
    title: "Pleated Linen & Ceramic Table Lamp",
    category: "Lamps",
    price: "6200.00",
    finish: "Raw Oatmeal Ceramic & Warm Linen",
    cm: [46, 30, 30],
    description:
      "A ceramic base in a raw oatmeal glaze with a pleated linen shade that gives a warm, even glow."
  },
  {
    sku: "GKR-LMP-002",
    title: "Sculptural Rattan & Brass Floor Lamp",
    category: "Lamps",
    price: "12900.00",
    finish: "Woven Cane & Matte Brass",
    cm: [152, 38, 38],
    description:
      "A standing lamp with a woven cane shade on a slim matte brass stem, for a reading corner or living room."
  },
  {
    sku: "GKR-VAS-001",
    title: "Crushed Glass & Gold Leaf Statement Vase",
    category: "Vases & Glass",
    price: "4200.00",
    finish: "Champagne Crushed Crystal",
    cm: [32, 18, 18],
    description:
      "A weighty glass vase with a crushed crystal texture and gold leaf detail, made to stand alone on a console."
  },
  {
    sku: "GKR-VAS-002",
    title: "Amber Fluted Borosilicate Hurricane Vase",
    category: "Vases & Glass",
    price: "3400.00",
    finish: "Warm Honey Amber Glass",
    cm: [26, 15, 15],
    description:
      "A fluted amber glass vase that holds a candle or a few stems and catches the light across a table."
  },
  {
    sku: "GKR-PLT-001",
    title: "Fiddle Leaf Fig in Textured Terracotta Pot",
    category: "Artificial Plants",
    price: "5500.00",
    finish: "Matte Terracotta Clay & Botanical Foliage",
    cm: [110, 45, 45],
    description:
      "An artificial fiddle leaf fig with full foliage, planted in a textured terracotta pot."
  },
  {
    sku: "GKR-PLT-002",
    title: "Trailing Olive Branch Ceramic Planter",
    category: "Artificial Plants",
    price: "3900.00",
    finish: "Chalk White Stoneware",
    cm: [58, 32, 32],
    description:
      "Trailing artificial olive branches in a chalk white stoneware planter, for a shelf or a high surface."
  }
] as const;

/** Inches to one decimal place, computed once at seed time. */
function toInches(centimetres: readonly number[]): string {
  return `${centimetres.map((value) => (value / 2.54).toFixed(1)).join(" × ")} in`;
}

const parsed = SeedEnvironmentSchema.safeParse(process.env);
if (!parsed.success) {
  process.stderr.write(
    "Seed requires DATABASE_URL_OWNER and ALLOW_DESTRUCTIVE_SEED=true. No data was changed.\n"
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Seed will upsert the Owner, six demo identities and eight catalogue products in the configured database.\n"
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
      for (const product of SeedProducts) {
        const data = {
          title: product.title,
          description: product.description,
          category: product.category,
          finish: product.finish,
          dimensionsCm: `${product.cm.join(" × ")} cm`,
          dimensionsIn: toInches(product.cm),
          pricePkr: new Prisma.Decimal(product.price),
          updatedAt: new Date()
        };
        await transaction.product.upsert({
          where: { sku: product.sku },
          create: { sku: product.sku, availability: "AVAILABLE", ...data },
          update: data
        });
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
