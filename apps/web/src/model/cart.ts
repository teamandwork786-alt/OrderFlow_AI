export interface CartLine {
  product_id: string;
  quantity: number;
}

export const MAX_QUANTITY = 20;
export const MAX_LINES = 30;
const STORAGE_KEY = "orderflow.cart";

/** Only product ids and quantities are stored; prices always come from the API. */
export function readCart(
  storage: Storage | undefined = safeStorage()
): CartLine[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine).slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export function writeCart(
  lines: readonly CartLine[],
  storage: Storage | undefined = safeStorage()
): void {
  if (!storage) return;
  try {
    // An empty bag leaves no key behind.
    if (lines.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage can be full or blocked; the in-memory bag still works.
  }
}

export function addLine(
  lines: readonly CartLine[],
  productId: string
): CartLine[] {
  const existing = lines.find((line) => line.product_id === productId);
  if (existing) return setLineQuantity(lines, productId, existing.quantity + 1);
  if (lines.length >= MAX_LINES) return [...lines];
  return [...lines, { product_id: productId, quantity: 1 }];
}

export function setLineQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number
): CartLine[] {
  if (quantity < 1) return removeLine(lines, productId);
  const bounded = Math.min(quantity, MAX_QUANTITY);
  return lines.map((line) =>
    line.product_id === productId ? { ...line, quantity: bounded } : line
  );
}

export function removeLine(
  lines: readonly CartLine[],
  productId: string
): CartLine[] {
  return lines.filter((line) => line.product_id !== productId);
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.product_id === "string" &&
    typeof line.quantity === "number" &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY
  );
}

function safeStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
