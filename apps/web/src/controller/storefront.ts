import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StorefrontProduct } from "@orderflow/shared";
import {
  addMinor,
  formatMinor,
  multiplyMinor,
  parseMoney
} from "../model/money.js";
import {
  fetchMyOrder,
  fetchMyOrders,
  fetchProducts
} from "../model/storefront-api.js";
import { useCart } from "./cart-store.js";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: 60_000
  });
}

export interface PricedLine {
  product: StorefrontProduct;
  quantity: number;
  lineMinor: bigint;
}

/** Joins the bag with live product data; prices are never stored locally. */
export function usePricedCart() {
  const cart = useCart();
  const products = useProducts();
  const [removedCount, setRemovedCount] = useState(0);

  // A product that is no longer listed would make checkout fail with
  // PRODUCT_UNAVAILABLE and could not be removed, so drop it from the bag.
  const { prune } = cart;
  const cartLines = cart.lines;
  const productList = products.data;
  useEffect(() => {
    if (!productList) return;
    const known = new Set(productList.map((item) => item.id));
    const stale = cartLines
      .map((line) => line.product_id)
      .filter((id) => !known.has(id));
    if (stale.length === 0) return;
    prune(stale);
    setRemovedCount((count) => count + stale.length);
  }, [productList, cartLines, prune]);

  return useMemo(() => {
    const byId = new Map((products.data ?? []).map((item) => [item.id, item]));
    const priced: PricedLine[] = [];
    const missing: string[] = [];
    for (const line of cart.lines) {
      const product = byId.get(line.product_id);
      if (!product) {
        missing.push(line.product_id);
        continue;
      }
      priced.push({
        product,
        quantity: line.quantity,
        lineMinor: multiplyMinor(parseMoney(product.price), line.quantity)
      });
    }
    const subtotalMinor = priced.reduce(
      (sum, line) => addMinor(sum, line.lineMinor),
      0n
    );
    const unavailable = priced.filter(
      (line) =>
        line.product.availability !== "AVAILABLE" || line.product.is_held
    );
    return {
      cart,
      products,
      lines: priced,
      missingIds: products.data ? missing : [],
      removedCount,
      unavailable,
      subtotalMinor,
      expectedTotal: formatMinor(subtotalMinor)
    };
  }, [cart, products, removedCount]);
}

export function useMyOrders(page: number) {
  return useQuery({
    queryKey: ["my-orders", page],
    queryFn: () => fetchMyOrders(page)
  });
}

export function useMyOrder(orderNumber: string) {
  return useQuery({
    queryKey: ["my-order", orderNumber],
    queryFn: () => fetchMyOrder(orderNumber),
    retry: false
  });
}
