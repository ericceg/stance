import { describe, expect, it } from "vitest";
import { formatChf, formatCurrency, formatPercent } from "./format";

describe("financial formatting", () => {
  it("always preserves negative currency and percentage signs", () => {
    expect(formatChf(-4_548.6)).toBe("−CHF 4'548.60");
    expect(formatPercent(-12.5)).toBe("−12.50%");
    expect(formatCurrency(-42.1, "EUR")).toBe("−EUR 42.10");
  });

  it("adds a plus sign only when signed positive output is requested", () => {
    expect(formatChf(42.1)).toBe("CHF 42.10");
    expect(formatChf(42.1, { signed: true })).toBe("+CHF 42.10");
    expect(formatPercent(12.5, { signed: true })).toBe("+12.50%");
  });

  it("normalizes values that round to zero", () => {
    expect(formatChf(-0.001, { signed: true })).toBe("CHF 0.00");
    expect(formatPercent(-0.001, { signed: true })).toBe("0.00%");
  });
});
