import { useSyncExternalStore } from "react";
import {
  addLine,
  readCart,
  removeLine,
  setLineQuantity,
  writeCart,
  type CartLine
} from "../model/cart.js";

let lines: CartLine[] = readCart();
const listeners = new Set<() => void>();

function commit(next: CartLine[]): void {
  lines = next;
  writeCart(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called on sign-out and after a successful order. */
export function clearCart(): void {
  commit([]);
}

export function useCart() {
  const current = useSyncExternalStore(subscribe, () => lines);
  return {
    lines: current,
    count: current.reduce((sum, line) => sum + line.quantity, 0),
    add: (productId: string) => commit(addLine(lines, productId)),
    setQuantity: (productId: string, quantity: number) =>
      commit(setLineQuantity(lines, productId, quantity)),
    remove: (productId: string) => commit(removeLine(lines, productId)),
    /** Drops lines whose product is no longer sold. */
    prune: (productIds: readonly string[]) =>
      commit(lines.filter((line) => !productIds.includes(line.product_id))),
    clear: clearCart
  };
}
