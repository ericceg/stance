import { describe, expect, it } from "vitest";
import { calculateCashChf, calculatePortfolio, deriveAccountPositions } from "./accounting";
import type { AccountingTransaction, BrokerAccountRecord, QuoteRecord, SecurityRecord, TransactionType } from "./types";

const accountA: BrokerAccountRecord = { id: "account-a", brokerName: "Broker A", accountName: "Main", baseCurrency: "CHF" };
const accountB: BrokerAccountRecord = { id: "account-b", brokerName: "Broker B", accountName: "Main", baseCurrency: "EUR" };
const security: SecurityRecord = { id: "security-a", isin: "CH0000000001", ticker: "TEST", name: "Test Security", assetType: "STOCK", exchange: "SIX", tradingCurrency: "CHF", marketDataTicker: "TEST.SW", marketDataProvider: "MOCK" };

function transaction(input: Partial<AccountingTransaction> & { id: string; type: TransactionType }): AccountingTransaction {
  return {
    securityId: security.id,
    brokerAccountId: accountA.id,
    timestamp: new Date("2026-01-01T12:00:00Z"),
    quantity: null,
    executionPrice: null,
    transactionCurrency: "CHF",
    fxRateToChf: 1,
    fee: 0,
    feeChf: 0,
    totalValue: 0,
    totalValueChf: 0,
    ...input,
  };
}

function buy(id: string, quantity: number, price: number, fee = 0, accountId = accountA.id, fxRate = 1) {
  return transaction({ id, type: "BUY", brokerAccountId: accountId, quantity, executionPrice: price, fee, feeChf: fee * fxRate, totalValue: quantity * price, totalValueChf: quantity * price * fxRate, fxRateToChf: fxRate });
}

function quote(overrides?: Partial<QuoteRecord>): QuoteRecord {
  return { securityId: security.id, price: 130, previousClose: 128, currency: "CHF", fxRateToChf: 1, provider: "MOCK", quotedAt: new Date("2026-08-31T12:00:00Z"), ...overrides };
}

describe("average-cost accounting", () => {
  it("calculates a weighted average across multiple buys and includes fees", () => {
    const result = deriveAccountPositions([buy("buy-1", 10, 100, 10), buy("buy-2", 10, 120, 10)]);
    expect(result.issues).toEqual([]);
    expect(result.positions[0].quantity).toBe(20);
    expect(result.positions[0].costBasisChf).toBe(2220);
    expect(result.positions[0].averageCostChf).toBe(111);
  });

  it("releases average cost and realizes P&L on a partial sell", () => {
    const sell = transaction({ id: "sell", type: "SELL", timestamp: new Date("2026-02-01T12:00:00Z"), quantity: 8, executionPrice: 130, fee: 4, feeChf: 4, totalValue: 1040, totalValueChf: 1040 });
    const result = deriveAccountPositions([buy("buy-1", 10, 100), buy("buy-2", 10, 120), sell]);
    expect(result.positions[0].quantity).toBe(12);
    expect(result.positions[0].costBasisChf).toBe(1320);
    expect(result.positions[0].realizedPnlChf).toBe(156);
  });

  it("clears cost basis after a full sell", () => {
    const sell = transaction({ id: "sell-all", type: "SELL", timestamp: new Date("2026-02-01T12:00:00Z"), quantity: 10, executionPrice: 115, totalValue: 1150, totalValueChf: 1150 });
    const result = deriveAccountPositions([buy("buy", 10, 100), sell]);
    expect(result.positions[0].quantity).toBe(0);
    expect(result.positions[0].costBasisChf).toBe(0);
    expect(result.positions[0].realizedPnlChf).toBe(150);
  });

  it("keeps account positions separate and aggregates the same security across brokers", () => {
    const result = calculatePortfolio({
      transactions: [buy("broker-a", 4, 100), buy("broker-b", 6, 110, 0, accountB.id)],
      securities: [security],
      brokerAccounts: [accountA, accountB],
      quotes: [quote()],
    });
    expect(result.positions[0].quantity).toBe(10);
    expect(result.positions[0].accountPositions).toHaveLength(2);
    expect(result.positions[0].marketValueChf).toBe(1300);
  });

  it("adds dividends and subtracts both trade and standalone fees", () => {
    const dividend = transaction({ id: "dividend", type: "DIVIDEND", totalValue: 50, totalValueChf: 50, fee: 2, feeChf: 2 });
    const securityFee = transaction({ id: "security-fee", type: "FEE", totalValue: 8, totalValueChf: 8 });
    const globalFee = transaction({ id: "global-fee", type: "FEE", securityId: null, totalValue: 12, totalValueChf: 12 });
    const result = calculatePortfolio({ transactions: [buy("buy", 10, 100), dividend, securityFee, globalFee], securities: [security], brokerAccounts: [accountA], quotes: [quote({ price: 100, previousClose: 100 })] });
    expect(result.positions[0].dividendIncomeChf).toBe(48);
    expect(result.positions[0].realizedPnlChf).toBe(40);
    expect(result.realizedPnlChf).toBe(28);
    expect(result.totalPnlChf).toBe(28);
  });

  it("does not treat a deposit as profit", () => {
    const deposit = transaction({ id: "deposit", type: "DEPOSIT", securityId: null, totalValue: 1000, totalValueChf: 1000 });
    const result = calculatePortfolio({ transactions: [deposit], securities: [], brokerAccounts: [accountA], quotes: [] });
    expect(result.cashChf).toBe(1000);
    expect(result.netContributionsChf).toBe(1000);
    expect(result.totalPnlChf).toBe(0);
  });

  it("uses stored transaction FX for cost and current FX for market value", () => {
    const usdSecurity = { ...security, tradingCurrency: "USD" };
    const result = calculatePortfolio({
      transactions: [buy("usd-buy", 10, 100, 0, accountA.id, 0.8)],
      securities: [usdSecurity],
      brokerAccounts: [accountA],
      quotes: [quote({ price: 110, currency: "USD", fxRateToChf: 0.75 })],
    });
    expect(result.positions[0].costBasisChf).toBe(800);
    expect(result.positions[0].marketValueChf).toBe(825);
    expect(result.positions[0].unrealizedPnlChf).toBe(25);
  });

  it("tracks cash for buys, sells, fees, deposits, withdrawals, and dividends", () => {
    const cash = calculateCashChf([
      transaction({ id: "deposit", type: "DEPOSIT", securityId: null, totalValue: 2000, totalValueChf: 2000 }),
      buy("buy", 10, 100, 5),
      transaction({ id: "sell", type: "SELL", quantity: 2, executionPrice: 120, totalValue: 240, totalValueChf: 240, fee: 2, feeChf: 2 }),
      transaction({ id: "dividend", type: "DIVIDEND", totalValue: 20, totalValueChf: 20 }),
      transaction({ id: "fee", type: "FEE", securityId: null, totalValue: 10, totalValueChf: 10 }),
      transaction({ id: "withdrawal", type: "WITHDRAWAL", securityId: null, totalValue: 100, totalValueChf: 100 }),
    ]);
    expect(cash).toBe(1143);
  });

  it("reports and excludes an oversell instead of silently guessing", () => {
    const oversell = transaction({ id: "oversell", type: "SELL", timestamp: new Date("2026-02-01T12:00:00Z"), quantity: 11, executionPrice: 120, totalValue: 1320, totalValueChf: 1320 });
    const result = deriveAccountPositions([buy("buy", 10, 100), oversell]);
    expect(result.issues[0].code).toBe("OVERSOLD_POSITION");
    expect(result.positions[0].quantity).toBe(10);

    const portfolio = calculatePortfolio({
      transactions: [transaction({ id: "deposit", type: "DEPOSIT", securityId: null, totalValue: 2000, totalValueChf: 2000 }), buy("buy", 10, 100), oversell],
      securities: [security],
      brokerAccounts: [accountA],
      quotes: [quote({ price: 100 })],
    });
    expect(portfolio.cashChf).toBe(1000);
    expect(portfolio.portfolioValueChf).toBe(2000);
  });
});
