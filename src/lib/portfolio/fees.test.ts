import { describe, expect, it } from "vitest";
import { buildFeeSummary, getFeeAmountChf } from "./fees";
import type { AccountingTransaction } from "./types";

function transaction(input: Partial<AccountingTransaction> & Pick<AccountingTransaction, "id" | "type">): AccountingTransaction {
  return {
    securityId: null,
    brokerAccountId: "account-a",
    timestamp: new Date("2026-01-15T12:00:00Z"),
    quantity: null,
    executionPrice: null,
    transactionCurrency: "CHF",
    fxRateToChf: 1,
    fee: 0,
    feeChf: 0,
    totalValue: 0,
    totalValueChf: 0,
    ...input,
    id: input.id,
    type: input.type,
  };
}

describe("fee summaries", () => {
  it("uses the standalone fee amount instead of its incidental fee field", () => {
    expect(getFeeAmountChf(transaction({ id: "account-fee", type: "FEE", totalValueChf: 12, feeChf: 0 }))).toBe(12);
  });

  it("keeps trade, income, and account costs distinct while calculating the trade rate", () => {
    const summary = buildFeeSummary([
      transaction({ id: "buy", type: "BUY", totalValueChf: 1_000, feeChf: 2 }),
      transaction({ id: "sell", type: "SELL", totalValueChf: 500, feeChf: 1 }),
      transaction({ id: "dividend", type: "DIVIDEND", feeChf: 0.5 }),
      transaction({ id: "account", type: "FEE", totalValueChf: 8 }),
    ], new Date("2026-06-20T12:00:00Z"));

    expect(summary.totalChf).toBe(11.5);
    expect(summary.entryCount).toBe(4);
    expect(summary.tradeFeeChf).toBe(3);
    expect(summary.tradeVolumeChf).toBe(1_500);
    expect(summary.effectiveTradeFeePercent).toBeCloseTo(0.2);
    expect(summary.categories.map((item) => [item.category, item.amountChf])).toEqual([
      ["ACCOUNT", 8], ["TRADING", 3], ["INCOME", 0.5],
    ]);
  });

  it("fills a stable twelve-month timeline including empty months", () => {
    const summary = buildFeeSummary([
      transaction({ id: "old", type: "FEE", timestamp: new Date("2025-05-01T12:00:00Z"), totalValueChf: 50 }),
      transaction({ id: "recent", type: "FEE", timestamp: new Date("2026-05-01T12:00:00Z"), totalValueChf: 8 }),
    ], new Date("2026-06-20T12:00:00Z"));

    expect(summary.months).toHaveLength(12);
    expect(summary.trailingTwelveMonthsChf).toBe(8);
    expect(summary.months.find((month) => month.key === "2026-05")?.amountChf).toBe(8);
  });
});
