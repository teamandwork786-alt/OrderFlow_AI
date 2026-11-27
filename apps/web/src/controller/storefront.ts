import { useMemo } from "react";
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
      unavailable,
      subtotalMinor,
      expectedTotal: formatMinor(subtotalMinor)
    };
  }, [cart, products]);
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
