/** Exact decimal handling for money. Amounts travel as decimal strings; never as floating-point numbers. */

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Convert a decimal string such as "1250.50" to integer minor units (paisa). Throws on anything else. */
export function toMinorUnits(amount: string): number {
  if (typeof amount !== 'string' || !AMOUNT_RE.test(amount.trim())) {
    throw new RangeError('invalid money amount');
  }
  const [whole, frac = ''] = amount.trim().split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new RangeError('money amount too large');
  return minor;
}

export function sumMinorUnits(amounts: string[]): number {
  return amounts.reduce((total, a) => total + toMinorUnits(a), 0);
}
