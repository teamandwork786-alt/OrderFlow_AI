import type { Prisma } from "@prisma/client";

/**
 * Stock-hold decisions live only in this module (AGENTS 5.14). Holds arrive
 * with the stock-report slice; until then no product is ever held.
 */
export async function isHeld(
  _transaction: Prisma.TransactionClient,
  _productId: string
): Promise<boolean> {
  void _transaction;
  void _productId;
  return false;
}

export async function heldProductIds(
  _transaction: Prisma.TransactionClient,
  _productIds: readonly string[]
): Promise<Set<string>> {
  void _transaction;
  void _productIds;
  return new Set();
}
