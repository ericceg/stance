import { prisma } from "@/lib/db";
import { calculateCashChf, calculatePortfolio } from "./accounting";
import { buildPortfolioHistory } from "./history";
import { TRANSACTION_TYPES, type AccountingTransaction, type TransactionType } from "./types";

function toNumber(value: { toNumber(): number } | null) {
  return value === null ? null : value.toNumber();
}

function hasComparableLiveQuotes(positions: Array<{ quantity: number; quote: { provider: string } | null }>) {
  const openPositions = positions.filter((position) => position.quantity > 1e-9);
  return openPositions.length > 0 && openPositions.every((position) => position.quote?.provider === "YAHOO");
}

export async function loadPortfolio() {
  const [securities, brokerAccounts, transactions, quotes, snapshots] = await Promise.all([
    prisma.security.findMany({ orderBy: { name: "asc" } }),
    prisma.brokerAccount.findMany({ orderBy: { brokerName: "asc" } }),
    prisma.transaction.findMany({ orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }] }),
    prisma.priceQuote.findMany(),
    prisma.portfolioSnapshot.findMany({ orderBy: { timestamp: "asc" } }),
  ]);

  const knownTransactions = transactions.filter((transaction) => (TRANSACTION_TYPES as readonly string[]).includes(transaction.type));
  const unknownTransactionIssues = transactions
    .filter((transaction) => !(TRANSACTION_TYPES as readonly string[]).includes(transaction.type))
    .map((transaction) => ({
      code: "INVALID_TRANSACTION" as const,
      severity: "error" as const,
      transactionId: transaction.id,
      securityId: transaction.securityId ?? undefined,
      message: `Transaction ${transaction.id} has unknown type “${transaction.type}” and was excluded from calculations.`,
    }));

  const accountingTransactions: AccountingTransaction[] = knownTransactions.map((transaction) => ({
    id: transaction.id,
    securityId: transaction.securityId,
    brokerAccountId: transaction.brokerAccountId,
    type: transaction.type as TransactionType,
    timestamp: transaction.timestamp,
    quantity: toNumber(transaction.quantity),
    executionPrice: toNumber(transaction.executionPrice),
    transactionCurrency: transaction.transactionCurrency,
    fxRateToChf: transaction.fxRateToChf.toNumber(),
    fee: transaction.fee.toNumber(),
    feeChf: transaction.feeChf.toNumber(),
    totalValue: transaction.totalValue.toNumber(),
    totalValueChf: transaction.totalValueChf.toNumber(),
  }));

  const securityRecords = securities.map((security) => ({
    id: security.id,
    isin: security.isin,
    ticker: security.ticker,
    name: security.name,
    assetType: security.assetType,
    exchange: security.exchange,
    tradingCurrency: security.tradingCurrency,
    marketDataTicker: security.marketDataTicker,
    marketDataProvider: security.marketDataProvider,
  }));

  const accountRecords = brokerAccounts.map((account) => ({
    id: account.id,
    brokerName: account.brokerName,
    accountName: account.accountName,
    baseCurrency: account.baseCurrency,
  }));

  const quoteRecords = quotes.map((quote) => ({
    securityId: quote.securityId,
    price: quote.price.toNumber(),
    previousClose: toNumber(quote.previousClose),
    currency: quote.currency,
    fxRateToChf: quote.fxRateToChf.toNumber(),
    provider: quote.provider,
    quotedAt: quote.quotedAt,
  }));

  const summary = calculatePortfolio({
    transactions: accountingTransactions,
    securities: securityRecords,
    brokerAccounts: accountRecords,
    quotes: quoteRecords,
  });
  summary.issues.push(...unknownTransactionIssues);

  return {
    summary,
    transactions,
    accountingTransactions,
    securities,
    brokerAccounts,
    snapshots,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function recordCurrentPortfolioSnapshot() {
  const data = await loadPortfolio();
  const isComparableWithHistoricalCloses = hasComparableLiveQuotes(data.summary.positions);
  if (!isComparableWithHistoricalCloses) return null;
  return prisma.portfolioSnapshot.create({
    data: {
      timestamp: new Date(),
      portfolioValueChf: data.summary.portfolioValueChf,
      investedCapitalChf: data.summary.investedCapitalChf,
      cashChf: data.summary.cashChf,
      unrealizedPnlChf: data.summary.unrealizedPnlChf,
      realizedPnlChf: data.summary.realizedPnlChf,
      source: "INTRADAY_COMPARABLE",
    },
  });
}

export async function getDashboardData() {
  const data = await loadPortfolio();
  const accountById = new Map(data.brokerAccounts.map((account) => [account.id, account]));

  const positions = data.summary.positions
    .filter((position) => position.quantity > 0)
    .map((position) => ({
      ...position,
      quote: position.quote ? { ...position.quote, quotedAt: position.quote.quotedAt.toISOString() } : null,
      accountPositions: position.accountPositions.map((accountPosition) => ({
        ...accountPosition,
        brokerName: accountById.get(accountPosition.brokerAccountId)?.brokerName ?? "Unknown broker",
        accountName: accountById.get(accountPosition.brokerAccountId)?.accountName ?? "Unknown account",
        marketValueChf: position.currentPriceChf === null ? null : accountPosition.quantity * position.currentPriceChf,
      })),
      brokerLabel: position.accountPositions
        .map((accountPosition) => accountById.get(accountPosition.brokerAccountId)?.brokerName ?? "Unknown")
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" + "),
    }));

  const assetAllocation = new Map<string, number>();
  const currencyAllocation = new Map<string, number>();
  const brokerAllocation = new Map<string, number>();

  assetAllocation.set("Cash", data.summary.cashChf);
  currencyAllocation.set("CHF", data.summary.cashChf);

  for (const position of positions) {
    if (position.marketValueChf === null) continue;
    const assetLabel = position.security.assetType === "ETF" ? "ETFs" : position.security.assetType === "STOCK" ? "Stocks" : "Other";
    assetAllocation.set(assetLabel, (assetAllocation.get(assetLabel) ?? 0) + position.marketValueChf);
    currencyAllocation.set(position.security.tradingCurrency, (currencyAllocation.get(position.security.tradingCurrency) ?? 0) + position.marketValueChf);
    for (const accountPosition of position.accountPositions) {
      if (accountPosition.marketValueChf === null) continue;
      brokerAllocation.set(accountPosition.brokerName, (brokerAllocation.get(accountPosition.brokerName) ?? 0) + accountPosition.marketValueChf);
    }
  }

  for (const account of data.brokerAccounts) {
    const accountTransactions = data.accountingTransactions.filter((transaction) => transaction.brokerAccountId === account.id);
    const accountCash = calculateCashChf(accountTransactions);
    brokerAllocation.set(account.brokerName, (brokerAllocation.get(account.brokerName) ?? 0) + accountCash);
  }

  const toAllocation = (allocation: Map<string, number>) => [...allocation.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0.005)
    .sort((left, right) => right.value - left.value);

  // A portfolio is only as current as its oldest open-position quote. Using the
  // newest timestamp lets one live broker quote mask stale prices elsewhere.
  const portfolioQuoteTimestamp = positions.reduce<string | null>((oldest, position) => {
    if (!position.quote) return oldest;
    return oldest === null || position.quote.quotedAt < oldest ? position.quote.quotedAt : oldest;
  }, null);
  const quoteProviders = [...new Set(positions.flatMap((position) => position.quote ? [position.quote.provider] : []))];
  const quoteProviderLabel = quoteProviders.length === 0
    ? "No quotes"
    : quoteProviders.length > 1
      ? "Mixed quotes"
      : quoteProviders[0] === "MOCK"
        ? "Mock quotes"
        : quoteProviders[0] === "YAHOO"
          ? "Yahoo Finance"
        : quoteProviders[0];
  const history = buildPortfolioHistory({
    snapshots: data.snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      portfolioValueChf: snapshot.portfolioValueChf.toNumber(),
      investedCapitalChf: snapshot.investedCapitalChf.toNumber(),
      cashChf: snapshot.cashChf.toNumber(),
      unrealizedPnlChf: snapshot.unrealizedPnlChf.toNumber(),
      realizedPnlChf: snapshot.realizedPnlChf.toNumber(),
      source: snapshot.source as "HISTORICAL_CLOSE" | "INTRADAY_COMPARABLE" | "LIVE_ESTIMATE",
    })),
    current: {
      portfolioValueChf: data.summary.portfolioValueChf,
      investedCapitalChf: data.summary.investedCapitalChf,
      cashChf: data.summary.cashChf,
      unrealizedPnlChf: data.summary.unrealizedPnlChf,
      realizedPnlChf: data.summary.realizedPnlChf,
    },
    hasTransactions: data.transactions.length > 0,
    currentSource: hasComparableLiveQuotes(data.summary.positions) ? "INTRADAY_COMPARABLE" : "LIVE_ESTIMATE",
  });

  return {
    summary: {
      cashChf: data.summary.cashChf,
      investedCapitalChf: data.summary.investedCapitalChf,
      marketValueChf: data.summary.marketValueChf,
      portfolioValueChf: data.summary.portfolioValueChf,
      netContributionsChf: data.summary.netContributionsChf,
      realizedPnlChf: data.summary.realizedPnlChf,
      unrealizedPnlChf: data.summary.unrealizedPnlChf,
      totalPnlChf: data.summary.totalPnlChf,
      todayPnlChf: data.summary.todayPnlChf,
      todayReturnPercent: data.summary.todayReturnPercent,
      totalReturnPercent: data.summary.totalReturnPercent,
    },
    positions,
    issues: data.summary.issues,
    snapshots: history.points,
    recordedSnapshotCount: history.recordedPointCount,
    hasTransactions: data.transactions.length > 0,
    allocation: {
      asset: toAllocation(assetAllocation),
      currency: toAllocation(currencyAllocation),
      broker: toAllocation(brokerAllocation),
    },
    updatedAt: portfolioQuoteTimestamp,
    quoteProviderLabel,
  };
}

export async function getPositionDetail(securityId: string) {
  const data = await loadPortfolio();
  const position = data.summary.positions.find((item) => item.securityId === securityId);
  if (!position) return null;

  const accountById = new Map(data.brokerAccounts.map((account) => [account.id, account]));
  const transactions = data.transactions
    .filter((transaction) => transaction.securityId === securityId)
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      timestamp: transaction.timestamp.toISOString(),
      quantity: toNumber(transaction.quantity),
      executionPrice: toNumber(transaction.executionPrice),
      transactionCurrency: transaction.transactionCurrency,
      fee: transaction.fee.toNumber(),
      totalValue: transaction.totalValue.toNumber(),
      totalValueChf: transaction.totalValueChf.toNumber(),
      brokerName: accountById.get(transaction.brokerAccountId)?.brokerName ?? "Unknown broker",
      notes: transaction.notes,
    }));

  return {
    position: {
      ...position,
      quote: position.quote ? { ...position.quote, quotedAt: position.quote.quotedAt.toISOString() } : null,
      accountPositions: position.accountPositions.map((accountPosition) => ({
        ...accountPosition,
        brokerName: accountById.get(accountPosition.brokerAccountId)?.brokerName ?? "Unknown broker",
        accountName: accountById.get(accountPosition.brokerAccountId)?.accountName ?? "Unknown account",
        marketValueChf: position.currentPriceChf === null ? null : accountPosition.quantity * position.currentPriceChf,
      })),
    },
    transactions,
  };
}
