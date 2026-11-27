import { Prisma } from "@prisma/client";
import type { StorefrontProduct } from "@orderflow/shared";
import { prisma } from "../../db/prisma.js";
import { heldProductIds } from "../stock/index.js";

export interface LockedProduct {
  id: string;
  sku: string;
  title: string;
  pricePkr: Prisma.Decimal;
  availability: string;
}

export async function listStorefrontProducts(): Promise<StorefrontProduct[]> {
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.product.findMany({
      where: { availability: { not: "HIDDEN" } },
      orderBy: [{ category: "asc" }, { title: "asc" }]
    });
    const held = await heldProductIds(
      transaction,
      rows.map((row) => row.id)
    );
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      title: row.title,
      description: row.description,
      category: row.category,
      finish: row.finish,
      dimensions_cm: row.dimensionsCm,
      dimensions_in: row.dimensionsIn,
      badge: row.badge,
      price: row.pricePkr.toFixed(2),
      availability:
        row.availability === "AVAILABLE" ? "AVAILABLE" : "OUT_OF_STOCK",
      is_held: held.has(row.id)
    }));
  });
}

/** Reads products with a shared row lock so a concurrent report cannot race. */
export async function lockProductsForShare(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[]
): Promise<LockedProduct[]> {
  if (productIds.length === 0) return [];
  const rows = await transaction.$queryRaw<
    Array<{
      id: string;
      sku: string;
      title: string;
      price_pkr: Prisma.Decimal;
      availability: string;
    }>
  >`SELECT id, sku, title, price_pkr, availability
      FROM products
     WHERE id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
       FOR SHARE`;
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    title: row.title,
    pricePkr: new Prisma.Decimal(row.price_pkr),
    availability: row.availability
  }));
}
