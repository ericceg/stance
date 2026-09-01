import "server-only";

import { prisma } from "@/lib/db";
import { YahooFinanceMarketDataProvider } from "@/lib/providers/market-data";
import { loadPortfolio } from "./service";

export interface MarketDataRefreshReport {
  attempted: number;
  updated: number;
  warnings: string[];
}

export async function refreshOpenPositionQuotes(): Promise<MarketDataRefreshReport> {
  const portfolio = await loadPortfolio();
  const provider = new YahooFinanceMarketDataProvider();
  const targets = portfolio.summary.positions.filter((position) => (
    position.quantity > 1e-9
    && position.quote?.provider !== "TRADING212"
    && (position.quote === null || position.quote.provider === provider.name)
  ));
  const results = await Promise.allSettled(targets.map(async (position) => {
    const latestTrade = portfolio.accountingTransactions.findLast((transaction) => (
      transaction.securityId === position.securityId
      && (transaction.type === "BUY" || transaction.type === "SELL")
    ));
    const tradingCurrency = latestTrade?.transactionCurrency ?? position.security.tradingCurrency;
    const resolved = await provider.getResolvedQuote({ ...position.security, tradingCurrency });
    if (!resolved) throw new Error(`No Yahoo Finance symbol matched ${position.security.name}.`);
    await prisma.$transaction([
      prisma.security.update({
        where: { id: position.securityId },
        data: { marketDataProvider: provider.name, marketDataTicker: resolved.symbol, tradingCurrency },
      }),
      prisma.priceQuote.upsert({
        where: { securityId: position.securityId },
        create: resolved.quote,
        update: {
          price: resolved.quote.price,
          previousClose: resolved.quote.previousClose,
          currency: resolved.quote.currency,
          fxRateToChf: resolved.quote.fxRateToChf,
          provider: resolved.quote.provider,
          quotedAt: resolved.quote.quotedAt,
        },
      }),
    ]);
    return position.security.name;
  }));
  const warnings = results.flatMap((result, index) => result.status === "rejected"
    ? [`${targets[index].security.name}: ${result.reason instanceof Error ? result.reason.message : "Price refresh failed."}`]
    : []);
  return { attempted: targets.length, updated: results.length - warnings.length, warnings };
}
