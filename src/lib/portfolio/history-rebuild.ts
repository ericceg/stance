import "server-only";

import { prisma } from "@/lib/db";
import { YahooFinanceMarketDataProvider, type HistoricalPrice } from "@/lib/providers/market-data";
import { fxRateProvider, historicalFxKey, type HistoricalFxRequest } from "@/lib/providers/fx";
import { reconstructDailyPortfolioSnapshots, type HistoricalValuationPoint } from "./history-reconstruction";
import { loadPortfolio } from "./service";

function endOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
}

export interface HistoryRebuildReport {
  snapshotsCreated: number;
  skippedDays: number;
  warnings: string[];
}

export async function rebuildPortfolioHistory(currentTimestamp = new Date()): Promise<HistoryRebuildReport> {
  const portfolio = await loadPortfolio();
  if (portfolio.accountingTransactions.length === 0) {
    await prisma.portfolioSnapshot.deleteMany();
    return { snapshotsCreated: 0, skippedDays: 0, warnings: [] };
  }

  const provider = new YahooFinanceMarketDataProvider();
  const tradedSecurityIds = new Set(portfolio.accountingTransactions.flatMap((transaction) => (
    transaction.securityId && (transaction.type === "BUY" || transaction.type === "SELL")
      ? [transaction.securityId]
      : []
  )));
  const securities = portfolio.securities.filter((security) => tradedSecurityIds.has(security.id));
  const tomorrow = new Date(Date.UTC(
    currentTimestamp.getUTCFullYear(),
    currentTimestamp.getUTCMonth(),
    currentTimestamp.getUTCDate() + 1,
  ));
  const warnings: string[] = [];

  const priceResults: Array<{ securityId: string; prices: HistoricalPrice[] }> = [];
  // Yahoo throttles bursts of chart/search requests. Historical rebuilding is
  // infrequent, so resolve securities sequentially for a complete data set.
  for (const security of securities) {
    const securityTransactions = portfolio.accountingTransactions.filter((transaction) => transaction.securityId === security.id);
    const latestTrade = securityTransactions.findLast((transaction) => transaction.type === "BUY" || transaction.type === "SELL");
    const firstTrade = securityTransactions.find((transaction) => transaction.type === "BUY" || transaction.type === "SELL");
    if (!firstTrade) {
      priceResults.push({ securityId: security.id, prices: [] });
      continue;
    }
    try {
      const prices = await provider.getHistoricalPrices(
        { ...security, tradingCurrency: latestTrade?.transactionCurrency ?? security.tradingCurrency },
        { from: firstTrade.timestamp, to: tomorrow, interval: "DAY" },
      );
      priceResults.push({ securityId: security.id, prices });
    } catch (error) {
      warnings.push(`${security.name}: ${error instanceof Error ? error.message : "Historical prices are unavailable."}`);
      priceResults.push({ securityId: security.id, prices: [] });
    }
  }

  const historicalFxRequests: HistoricalFxRequest[] = priceResults.flatMap((result) => result.prices.map((price) => ({
    currency: price.currency,
    date: price.timestamp,
  })));
  const historicalRates = await fxRateProvider.getHistoricalRatesToChf(historicalFxRequests);
  const marketPoints: HistoricalValuationPoint[] = priceResults.flatMap((result) => result.prices.map((price) => ({
      securityId: result.securityId,
      timestamp: endOfUtcDay(price.timestamp),
      price: price.price,
      currency: price.currency,
      fxRateToChf: historicalRates.get(historicalFxKey(price.currency, price.timestamp))!,
    })));
  const executionPoints: HistoricalValuationPoint[] = portfolio.accountingTransactions.flatMap((transaction) => (
    transaction.securityId
    && (transaction.type === "BUY" || transaction.type === "SELL")
    && transaction.executionPrice !== null
      ? [{
        securityId: transaction.securityId,
        timestamp: transaction.timestamp,
        price: transaction.executionPrice,
        currency: transaction.transactionCurrency,
        fxRateToChf: transaction.fxRateToChf,
      }]
      : []
  ));
  const valuations = [...executionPoints, ...marketPoints];
  const reconstructed = reconstructDailyPortfolioSnapshots({
    transactions: portfolio.accountingTransactions,
    securities: portfolio.securities.map((security) => ({
      id: security.id,
      isin: security.isin,
      ticker: security.ticker,
      name: security.name,
      assetType: security.assetType,
      exchange: security.exchange,
      tradingCurrency: security.tradingCurrency,
      marketDataTicker: security.marketDataTicker,
      marketDataProvider: security.marketDataProvider,
    })),
    brokerAccounts: portfolio.brokerAccounts.map((account) => ({
      id: account.id,
      brokerName: account.brokerName,
      accountName: account.accountName,
      baseCurrency: account.baseCurrency,
    })),
    valuations,
    currentTimestamp,
  });

  await prisma.$transaction(async (tx) => {
    await tx.portfolioSnapshot.deleteMany();
    if (reconstructed.snapshots.length > 0) {
      await tx.portfolioSnapshot.createMany({ data: reconstructed.snapshots });
    }
    await tx.portfolioSnapshot.create({
      data: {
        timestamp: new Date(Math.max(currentTimestamp.getTime(), (reconstructed.snapshots.at(-1)?.timestamp.getTime() ?? 0) + 1)),
        portfolioValueChf: portfolio.summary.portfolioValueChf,
        investedCapitalChf: portfolio.summary.investedCapitalChf,
        cashChf: portfolio.summary.cashChf,
        unrealizedPnlChf: portfolio.summary.unrealizedPnlChf,
        realizedPnlChf: portfolio.summary.realizedPnlChf,
      },
    });
  }, { timeout: 120_000 });

  return {
    snapshotsCreated: reconstructed.snapshots.length + 1,
    skippedDays: reconstructed.skippedDays,
    warnings,
  };
}
