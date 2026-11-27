import { describe, expect, it } from "vitest";
import {
  addMinor,
  formatMinor,
  formatPkr,
  multiplyMinor,
  parseMoney
} from "../../src/model/money.js";

describe("1B-W01 client money helper (BigInt minor units, no float)", () => {
  it("parses decimal strings into minor units", () => {
    expect(parseMoney("1500.50")).toBe(150050n);
    expect(parseMoney("1500.5")).toBe(150050n);
    expect(parseMoney("250")).toBe(25000n);
    expect(parseMoney("0.00")).toBe(0n);
  });

  it("rejects text that is not a plain non-negative amount", () => {
    for (const bad of ["", "-1.00", "1.234", "1e3", "abc", "1,000.00", " 1"]) {
      expect(() => parseMoney(bad), bad).toThrow();
    }
  });

  it("adds and multiplies exactly where floats would drift", () => {
    expect(addMinor(parseMoney("0.10"), parseMoney("0.20"))).toBe(30n);
    expect(multiplyMinor(parseMoney("19.99"), 3)).toBe(5997n);
    expect(
      addMinor(
        multiplyMinor(parseMoney("1500.50"), 2),
        multiplyMinor(parseMoney("250.00"), 1)
      )
    ).toBe(325100n);
  });

  it("formats back to the two-place decimal string the API uses", () => {
    expect(formatMinor(325100n)).toBe("3251.00");
    expect(formatMinor(5n)).toBe("0.05");
    expect(formatMinor(0n)).toBe("0.00");
    expect(formatMinor(parseMoney("9999999999.99"))).toBe("9999999999.99");
  });

  it("formats a display amount with grouping", () => {
    expect(formatPkr(325100n)).toBe("PKR 3,251.00");
    expect(formatPkr(123456789n)).toBe("PKR 1,234,567.89");
  });
});
