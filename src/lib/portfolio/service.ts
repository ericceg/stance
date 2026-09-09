import { prisma } from "@/lib/db";
import { calculateCashChf, calculatePortfolio } from "./accounting";
import { buildPortfolioHistory, type SnapshotSource } from "./history";
import { TRANSACTION_TYPES, type AccountingTransaction, type TransactionType } from "./types";

function toNumber(value: { toNumber(): number } | null) {
  return value === null ? null : value.toNumber();
}

function hasComparableLiveQuotes(positions: Array<{ quantity: number; quote: { provider: string } | null }>) {
  const openPositions = positions.filter((position) => position.quantity > 1e-9);
  return openPositions.length > 0 && openPositions.every((position) => position.quote?.provider === "YAHOO");
}

export async function loadPortfolio() {
  const [securities, brokerAccounts, transactions, quotes, snapshots, securitySnapshots, regionalExposures, underlyingHoldings] = await Promise.all([
    prisma.security.findMany({ orderBy: { name: "asc" } }),
    prisma.brokerAccount.findMany({ orderBy: { brokerName: "asc" } }),
    prisma.transaction.findMany({ orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }] }),
    prisma.priceQuote.findMany(),
    prisma.portfolioSnapshot.findMany({ orderBy: { timestamp: "asc" } }),
    prisma.securitySnapshot.findMany({ orderBy: { timestamp: "asc" } }),
    prisma.securityRegionalExposure.findMany({ orderBy: [{ securityId: "asc" }, { region: "asc" }] }),
    prisma.securityUnderlyingHolding.findMany({ orderBy: [{ securityId: "asc" }, { constituentName: "asc" }] }),
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
    securitySnapshots,
    regionalExposures,
    underlyingHoldings,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function recordCurrentPortfolioSnapshot() {
  const data = await loadPortfolio();
  const isComparableWithHistoricalCloses = hasComparableLiveQuotes(data.summary.positions);
  if (!isComparableWithHistoricalCloses) return null;
  const timestamp = new Date();
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.portfolioSnapshot.create({
      data: {
        timestamp,
        portfolioValueChf: data.summary.portfolioValueChf,
        investedCapitalChf: data.summary.investedCapitalChf,
        cashChf: data.summary.cashChf,
        unrealizedPnlChf: data.summary.unrealizedPnlChf,
        realizedPnlChf: data.summary.realizedPnlChf,
        source: "INTRADAY_COMPARABLE",
      },
    });
    const positionSnapshots = data.summary.positions.flatMap((position) => position.marketValueChf === null || position.totalPnlChf === null ? [] : [{
      securityId: position.securityId,
      timestamp,
      marketValueChf: position.marketValueChf,
      totalPnlChf: position.totalPnlChf,
      source: "INTRADAY_COMPARABLE",
    }]);
    if (positionSnapshots.length > 0) await tx.securitySnapshot.createMany({ data: positionSnapshots });
    return snapshot;
  });
}

export async function getDashboardData() {
  const data = await loadPortfolio();
  const accountById = new Map(data.brokerAccounts.map((account) => [account.id, account]));
  const regionalExposureBySecurity = new Map<string, typeof data.regionalExposures>();
  for (const exposure of data.regionalExposures) {
    const rows = regionalExposureBySecurity.get(exposure.securityId) ?? [];
    rows.push(exposure);
    regionalExposureBySecurity.set(exposure.securityId, rows);
  }
  const underlyingHoldingsBySecurity = new Map<string, typeof data.underlyingHoldings>();
  for (const holding of data.underlyingHoldings) {
    const rows = underlyingHoldingsBySecurity.get(holding.securityId) ?? [];
    rows.push(holding);
    underlyingHoldingsBySecurity.set(holding.securityId, rows);
  }

  const positions = data.summary.positions
    .filter((position) => position.quantity > 0)
    .map((position) => ({
      ...position,
      quote: position.quote ? { ...position.quote, quotedAt: position.quote.quotedAt.toISOString() } : null,
      // A security can be identified by the same ISIN on several exchanges. The
      // live quote identifies the actual listing being held, so it is the source
      // of truth for allocation currency when one is available.
      currency: position.quote?.currency ?? position.security.tradingCurrency,
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
      regionalExposures: (regionalExposureBySecurity.get(position.securityId) ?? []).map((exposure) => ({
        region: exposure.region,
        weight: exposure.weight.toNumber(),
        source: exposure.source,
        sourceUrl: exposure.sourceUrl,
        asOf: exposure.asOf?.toISOString() ?? null,
        updatedAt: exposure.updatedAt.toISOString(),
      })),
      underlyingHoldings: (underlyingHoldingsBySecurity.get(position.securityId) ?? []).map((holding) => ({
        ticker: holding.constituentTicker,
        name: holding.constituentName,
        weight: holding.weight.toNumber(),
        source: holding.source,
        sourceUrl: holding.sourceUrl,
        asOf: holding.asOf?.toISOString() ?? null,
        updatedAt: holding.updatedAt.toISOString(),
      })),
    }));

  const assetAllocation = new Map<string, number>();
  const currencyAllocation = new Map<string, number>();
  const brokerAllocation = new Map<string, number>();
  const regionAllocation = new Map<string, number>();
  const accountCashByAccount: Array<{ brokerName: string; accountName: string; valueChf: number }> = [];

  assetAllocation.set("Cash", data.summary.cashChf);
  currencyAllocation.set("CHF", data.summary.cashChf);
  regionAllocation.set("Cash", data.summary.cashChf);

  for (const position of positions) {
    if (position.marketValueChf === null) continue;
    const assetLabel = position.security.assetType === "ETF" ? "ETFs" : position.security.assetType === "STOCK" ? "Stocks" : "Other";
    assetAllocation.set(assetLabel, (assetAllocation.get(assetLabel) ?? 0) + position.marketValueChf);
    currencyAllocation.set(position.currency, (currencyAllocation.get(position.currency) ?? 0) + position.marketValueChf);
    const exposureTotal = position.regionalExposures.reduce((total, exposure) => total + exposure.weight, 0);
    const scale = exposureTotal > 100 ? 100 / exposureTotal : 1;
    for (const exposure of position.regionalExposures) {
      const value = position.marketValueChf * exposure.weight * scale / 100;
      regionAllocation.set(exposure.region, (regionAllocation.get(exposure.region) ?? 0) + value);
    }
    const unclassifiedWeight = Math.max(0, 100 - exposureTotal * scale);
    if (unclassifiedWeight > 0.005) {
      regionAllocation.set("Unclassified", (regionAllocation.get("Unclassified") ?? 0) + position.marketValueChf * unclassifiedWeight / 100);
    }
    for (const accountPosition of position.accountPositions) {
      if (accountPosition.marketValueChf === null) continue;
      brokerAllocation.set(accountPosition.brokerName, (brokerAllocation.get(accountPosition.brokerName) ?? 0) + accountPosition.marketValueChf);
    }
  }

  const excludedTransactionIds = new Set(data.summary.issues
    .filter((issue) => issue.severity === "error" && issue.transactionId)
    .map((issue) => issue.transactionId));
  for (const account of data.brokerAccounts) {
    const accountTransactions = data.accountingTransactions.filter((transaction) => transaction.brokerAccountId === account.id && !excludedTransactionIds.has(transaction.id));
    const accountCash = calculateCashChf(accountTransactions);
    brokerAllocation.set(account.brokerName, (brokerAllocation.get(account.brokerName) ?? 0) + accountCash);
    accountCashByAccount.push({ brokerName: account.brokerName, accountName: account.accountName, valueChf: accountCash });
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
  const currentSource: SnapshotSource = hasComparableLiveQuotes(data.summary.positions) ? "INTRADAY_COMPARABLE" : "LIVE_ESTIMATE";
  const currentHistoryTimestamp = history.points.at(-1)!.timestamp;
  const snapshotsBySecurity = new Map<string, typeof data.securitySnapshots>();
  for (const snapshot of data.securitySnapshots) {
    const list = snapshotsBySecurity.get(snapshot.securityId) ?? [];
    list.push(snapshot);
    snapshotsBySecurity.set(snapshot.securityId, list);
  }
  const securitySeries = data.summary.positions.map((position) => {
    const recorded = snapshotsBySecurity.get(position.securityId) ?? [];
    const isClosed = position.quantity <= 0;
    return {
      securityId: position.securityId,
      ticker: position.security.ticker,
      name: position.security.name,
      isClosed,
      snapshots: [
        ...recorded.map((snapshot) => ({
          timestamp: snapshot.timestamp.toISOString(),
          portfolioValueChf: snapshot.marketValueChf.toNumber(),
          totalPnlChf: snapshot.totalPnlChf.toNumber(),
          isLive: false,
          source: snapshot.source as SnapshotSource,
        })),
        ...(!isClosed && position.marketValueChf !== null && position.totalPnlChf !== null ? [{
          timestamp: currentHistoryTimestamp,
          portfolioValueChf: position.marketValueChf,
          totalPnlChf: position.totalPnlChf,
          isLive: true,
          source: currentSource,
        }] : []),
      ],
    };
  });
  const chartTransactions = data.accountingTransactions.flatMap((transaction) => (
    transaction.securityId && (transaction.type === "BUY" || transaction.type === "SELL")
      ? [{
        id: transaction.id,
        securityId: transaction.securityId,
        type: transaction.type,
        timestamp: transaction.timestamp.toISOString(),
      }]
      : []
  ));

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
    securitySeries,
    chartTransactions,
    recordedSnapshotCount: history.recordedPointCount,
    hasTransactions: data.transactions.length > 0,
    allocation: {
      asset: toAllocation(assetAllocation),
      currency: toAllocation(currencyAllocation),
      broker: toAllocation(brokerAllocation),
      region: toAllocation(regionAllocation),
    },
    accountCash: accountCashByAccount,
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
