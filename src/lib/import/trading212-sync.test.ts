import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { localToAccountRate } from "./trading212-fx";

function order(input?: {
  instrumentCurrency?: string;
  accountCurrency?: string;
  side?: "BUY" | "SELL";
  price?: number;
  quantity?: number;
  netValue?: number;
  fxRate?: number | null;
  taxes?: Array<{ chargedAt?: string; currency: string; name: string; quantity: number }>;
}) {
  const instrumentCurrency = input?.instrumentCurrency ?? "USD";
  const accountCurrency = input?.accountCurrency ?? "CHF";
  return {
    order: {
      id: 1,
      side: input?.side ?? "BUY" as const,
      instrument: { ticker: "TEST", name: "Test", currency: instrumentCurrency },
    },
    fill: {
      id: 2,
      type: "TRADE",
      filledAt: "2026-08-01T12:00:00Z",
      price: input?.price ?? 100,
      quantity: input?.quantity ?? 2,
      walletImpact: {
        currency: accountCurrency,
        netValue: input?.netValue ?? -162,
        fxRate: input && "fxRate" in input ? input.fxRate : 1.234567,
        taxes: input?.taxes ?? [],
      },
    },
  };
}

describe("Trading 212 fill FX", () => {
  it("inverts Trading 212's cross-currency FX rate", () => {
    const value = order();
    expect(localToAccountRate(value, value.fill)).toBeCloseTo(0.81);
  });

  it("matches the gross CHF wallet value without including the conversion fee", () => {
    const value = order({
      netValue: 200,
      fxRate: 1.0648153,
      price: 4.3305,
      quantity: 49.10371018,
      taxes: [{ currency: "CHF", name: "CURRENCY_CONVERSION_FEE", quantity: -0.3 }],
    });
    const grossChf = value.fill.price * value.fill.quantity * localToAccountRate(value, value.fill)!;
    expect(grossChf).toBeCloseTo(199.7);
  });

  it("uses one when the instrument and account currencies match", () => {
    const value = order({ instrumentCurrency: "CHF", accountCurrency: "CHF", netValue: -200 });
    expect(localToAccountRate(value, value.fill)).toBe(1);
  });

  it("derives a buy rate from wallet value excluding account-currency taxes when fxRate is absent", () => {
    const value = order({
      netValue: 162,
      fxRate: null,
      taxes: [{ currency: "CHF", name: "FEE", quantity: -2 }],
    });
    expect(localToAccountRate(value, value.fill)).toBeCloseTo(0.8);
  });

  it("derives a sell rate from net proceeds when fxRate is absent", () => {
    const value = order({
      side: "SELL",
      netValue: 158,
      fxRate: null,
      taxes: [{ currency: "CHF", name: "FEE", quantity: -2 }],
    });
    expect(localToAccountRate(value, value.fill)).toBeCloseTo(0.8);
  });
});
