/**
 * Money on the client is BigInt minor units (paisa). No floats anywhere, so
 * the total shown to the customer always equals the server's decimal total.
 */
const AMOUNT = /^[0-9]{1,10}(\.[0-9]{1,2})?$/;

export function parseMoney(text: string): bigint {
  if (!AMOUNT.test(text)) throw new Error("Invalid amount.");
  const [whole = "0", fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function addMinor(left: bigint, right: bigint): bigint {
  return left + right;
}

export function multiplyMinor(amount: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity) || quantity < 0)
    throw new Error("Invalid quantity.");
  return amount * BigInt(quantity);
}

/** Two-place decimal string, as the API sends and expects amounts. */
export function formatMinor(amount: bigint): string {
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** Display form with thousands separators, for example "PKR 3,251.00". */
export function formatPkr(amount: bigint): string {
  const [whole = "0", fraction = "00"] = formatMinor(amount).split(".");
  return `PKR ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
