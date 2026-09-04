import { describe, expect, it } from "vitest";
import { reconstructDailyPortfolioSnapshots, reconstructIntradayPortfolioSnapshots, type HistoricalValuationPoint } from "./history-reconstruction";
import type { AccountingTransaction, BrokerAccountRecord, SecurityRecord, TransactionType } from "./types";

const account: BrokerAccountRecord = { id: "account", brokerName: "Broker", accountName: "Main", baseCurrency: "CHF" };
const security: SecurityRecord = { id: "security", isin: "CH0000000001", ticker: "TEST", name: "Test", assetType: "STOCK", exchange: "SIX", tradingCurrency: "CHF", marketDataTicker: "TEST.SW", marketDataProvider: "YAHOO" };

function transaction(input: Partial<Omit<AccountingTransaction, "timestamp">> & { id: string; type: TransactionType; timestamp: string }): AccountingTransaction {
  return {
    securityId: null,
    brokerAccountId: account.id,
    quantity: null,
    executionPrice: null,
    transactionCurrency: "CHF",
    fxRateToChf: 1,
    fee: 0,
    feeChf: 0,
    totalValue: 0,
    totalValueChf: 0,
    ...input,
    timestamp: new Date(input.timestamp),
  };
}

function valuation(timestamp: string, price: number): HistoricalValuationPoint {
  return { securityId: security.id, timestamp: new Date(timestamp), price, currency: "CHF", fxRateToChf: 1 };
}

describe("historical portfolio reconstruction", () => {
  it("revalues the actual daily position without treating a deposit as performance", () => {
    const result = reconstructDailyPortfolioSnapshots({
      transactions: [
        transaction({ id: "deposit", type: "DEPOSIT", timestamp: "2026-08-30T08:00:00Z", totalValue: 1_000, totalValueChf: 1_000 }),
        transaction({ id: "buy", type: "BUY", timestamp: "2026-08-30T10:00:00Z", securityId: security.id, quantity: 10, executionPrice: 80, totalValue: 800, totalValueChf: 800 }),
        transaction({ id: "deposit-2", type: "DEPOSIT", timestamp: "2026-08-31T08:00:00Z", totalValue: 500, totalValueChf: 500 }),
      ],
      securities: [security],
      brokerAccounts: [account],
      valuations: [valuation("2026-08-30T20:00:00Z", 90), valuation("2026-08-31T20:00:00Z", 100)],
      currentTimestamp: new Date("2026-09-01T12:00:00Z"),
    });

    expect(result.skippedDays).toBe(0);
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots.map((snapshot) => snapshot.portfolioValueChf)).toEqual([1_100, 1_700]);
    expect(result.snapshots.map((snapshot) => snapshot.unrealizedPnlChf)).toEqual([100, 200]);
  });

  it("skips days where an open position cannot be valued", () => {
    const result = reconstructDailyPortfolioSnapshots({
      transactions: [transaction({ id: "buy", type: "BUY", timestamp: "2026-08-31T10:00:00Z", securityId: security.id, quantity: 1, executionPrice: 100, totalValue: 100, totalValueChf: 100 })],
      securities: [security],
      brokerAccounts: [account],
      valuations: [],
      currentTimestamp: new Date("2026-09-01T12:00:00Z"),
    });

    expect(result.snapshots).toEqual([]);
    expect(result.skippedDays).toBe(1);
  });

  it("revalues the portfolio at every available intraday market timestamp", () => {
    const transactions = [
      transaction({ id: "deposit", type: "DEPOSIT", timestamp: "2026-09-04T07:00:00Z", totalValue: 1_000, totalValueChf: 1_000 }),
      transaction({ id: "buy", type: "BUY", timestamp: "2026-09-04T07:30:00Z", securityId: security.id, quantity: 10, executionPrice: 80, totalValue: 800, totalValueChf: 800 }),
    ];
    const result = reconstructIntradayPortfolioSnapshots({
      transactions,
      securities: [security],
      brokerAccounts: [account],
      valuations: [
        valuation("2026-09-04T07:30:00Z", 80),
        valuation("2026-09-04T07:31:00Z", 81),
        valuation("2026-09-04T07:32:00Z", 82),
      ],
      timestamps: [new Date("2026-09-04T07:31:00Z"), new Date("2026-09-04T07:32:00Z")],
    });

    expect(result.skippedPoints).toBe(0);
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots.map((snapshot) => snapshot.unrealizedPnlChf)).toEqual([10, 20]);
    expect(result.snapshots.every((snapshot) => snapshot.source === "INTRADAY_COMPARABLE")).toBe(true);
  });
});
