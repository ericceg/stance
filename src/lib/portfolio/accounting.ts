import type {
  AccountPosition,
  AccountingTransaction,
  BrokerAccountRecord,
  DataIssue,
  PortfolioPosition,
  PortfolioSummary,
  QuoteRecord,
  SecurityRecord,
} from "./types";

const EPSILON = 1e-9;

type MutablePosition = AccountPosition;

function positionKey(securityId: string, brokerAccountId: string) {
  return `${securityId}:${brokerAccountId}`;
}

function createPosition(securityId: string, brokerAccountId: string): MutablePosition {
  return {
    securityId,
    brokerAccountId,
    quantity: 0,
    costBasisLocal: 0,
    costBasisChf: 0,
    averageCostLocal: 0,
    averageCostChf: 0,
    grossPurchasesChf: 0,
    realizedPnlChf: 0,
    dividendIncomeChf: 0,
    feesChf: 0,
  };
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function deriveAccountPositions(transactions: AccountingTransaction[]): {
  positions: AccountPosition[];
  issues: DataIssue[];
} {
  const positions = new Map<string, MutablePosition>();
  const issues: DataIssue[] = [];
  const orderedTransactions = [...transactions].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );

  for (const transaction of orderedTransactions) {
    if (!transaction.securityId) {
      continue;
    }

    const key = positionKey(transaction.securityId, transaction.brokerAccountId);
    const position = positions.get(key) ?? createPosition(transaction.securityId, transaction.brokerAccountId);

    if (transaction.type === "BUY") {
      if (!isPositive(transaction.quantity) || !isPositive(transaction.totalValue)) {
        issues.push({ code: "INVALID_TRANSACTION", severity: "error", transactionId: transaction.id, securityId: transaction.securityId, message: "Buy is missing a positive quantity or total value." });
        continue;
      }

      position.quantity += transaction.quantity;
      position.costBasisLocal += transaction.totalValue + transaction.fee;
      position.costBasisChf += transaction.totalValueChf + transaction.feeChf;
      position.grossPurchasesChf += transaction.totalValueChf + transaction.feeChf;
      position.feesChf += transaction.feeChf;
    } else if (transaction.type === "SELL") {
      if (!isPositive(transaction.quantity) || !isPositive(transaction.totalValue)) {
        issues.push({ code: "INVALID_TRANSACTION", severity: "error", transactionId: transaction.id, securityId: transaction.securityId, message: "Sell is missing a positive quantity or total value." });
        continue;
      }
      if (transaction.quantity > position.quantity + EPSILON) {
        issues.push({ code: "OVERSOLD_POSITION", severity: "error", transactionId: transaction.id, securityId: transaction.securityId, message: "Sell quantity exceeds the available position. The row was excluded from calculations." });
        continue;
      }

      const averageCostLocal = position.quantity > EPSILON ? position.costBasisLocal / position.quantity : 0;
      const averageCostChf = position.quantity > EPSILON ? position.costBasisChf / position.quantity : 0;
      const releasedCostLocal = averageCostLocal * transaction.quantity;
      const releasedCostChf = averageCostChf * transaction.quantity;

      position.quantity -= transaction.quantity;
      position.costBasisLocal -= releasedCostLocal;
      position.costBasisChf -= releasedCostChf;
      position.realizedPnlChf += transaction.totalValueChf - transaction.feeChf - releasedCostChf;
      position.feesChf += transaction.feeChf;

      if (position.quantity < EPSILON) {
        position.quantity = 0;
        position.costBasisLocal = 0;
        position.costBasisChf = 0;
      }
    } else if (transaction.type === "DIVIDEND") {
      position.dividendIncomeChf += transaction.totalValueChf - transaction.feeChf;
      position.realizedPnlChf += transaction.totalValueChf - transaction.feeChf;
      position.feesChf += transaction.feeChf;
    } else if (transaction.type === "FEE") {
      position.realizedPnlChf -= transaction.totalValueChf;
      position.feesChf += transaction.totalValueChf;
    }

    position.averageCostLocal = position.quantity > EPSILON ? position.costBasisLocal / position.quantity : 0;
    position.averageCostChf = position.quantity > EPSILON ? position.costBasisChf / position.quantity : 0;
    positions.set(key, position);
  }

  return { positions: [...positions.values()], issues };
}

export function calculateCashChf(transactions: AccountingTransaction[]): number {
  return transactions.reduce((cash, transaction) => {
    switch (transaction.type) {
      case "DEPOSIT":
        return cash + transaction.totalValueChf;
      case "WITHDRAWAL":
        return cash - transaction.totalValueChf;
      case "BUY":
        return cash - transaction.totalValueChf - transaction.feeChf;
      case "SELL":
      case "DIVIDEND":
        return cash + transaction.totalValueChf - transaction.feeChf;
      case "FEE":
        return cash - transaction.totalValueChf;
    }
  }, 0);
}

export function calculateNetContributionsChf(transactions: AccountingTransaction[]): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === "DEPOSIT") return total + transaction.totalValueChf;
    if (transaction.type === "WITHDRAWAL") return total - transaction.totalValueChf;
    return total;
  }, 0);
}

export function calculatePortfolio(input: {
  transactions: AccountingTransaction[];
  securities: SecurityRecord[];
  brokerAccounts: BrokerAccountRecord[];
  quotes: QuoteRecord[];
}): PortfolioSummary {
  const { positions: accountPositions, issues: accountingIssues } = deriveAccountPositions(input.transactions);
  const excludedTransactionIds = new Set(
    accountingIssues
      .filter((issue) => issue.severity === "error" && issue.transactionId)
      .map((issue) => issue.transactionId!),
  );
  const validTransactions = input.transactions.filter((transaction) => !excludedTransactionIds.has(transaction.id));
  const securityById = new Map(input.securities.map((security) => [security.id, security]));
  const quoteBySecurityId = new Map(input.quotes.map((quote) => [quote.securityId, quote]));
  const grouped = new Map<string, AccountPosition[]>();

  for (const position of accountPositions) {
    const list = grouped.get(position.securityId) ?? [];
    list.push(position);
    grouped.set(position.securityId, list);
  }

  const issues = [...accountingIssues];
  const positions: PortfolioPosition[] = [];

  for (const [securityId, accountBreakdown] of grouped) {
    const security = securityById.get(securityId);
    if (!security) continue;

    const quantity = accountBreakdown.reduce((total, position) => total + position.quantity, 0);
    const costBasisLocal = accountBreakdown.reduce((total, position) => total + position.costBasisLocal, 0);
    const costBasisChf = accountBreakdown.reduce((total, position) => total + position.costBasisChf, 0);
    const realizedPnlChf = accountBreakdown.reduce((total, position) => total + position.realizedPnlChf, 0);
    const dividendIncomeChf = accountBreakdown.reduce((total, position) => total + position.dividendIncomeChf, 0);
    const feesChf = accountBreakdown.reduce((total, position) => total + position.feesChf, 0);
    const grossPurchasesChf = accountBreakdown.reduce((total, position) => total + position.grossPurchasesChf, 0);
    const quote = quoteBySecurityId.get(securityId) ?? null;

    if (!security.isin) {
      issues.push({ code: "MISSING_ISIN", severity: "warning", securityId, message: `${security.name} has no ISIN and may be difficult to match across brokers.` });
    }
    if (!quote && quantity > EPSILON) {
      issues.push({ code: "MISSING_PRICE", severity: "warning", securityId, message: `${security.name} has no current market price.` });
    } else if (quote && (!Number.isFinite(quote.fxRateToChf) || quote.fxRateToChf <= 0)) {
      issues.push({ code: "MISSING_FX_RATE", severity: "error", securityId, message: `${security.name} has no valid ${quote.currency}/CHF rate.` });
    }

    const hasUsableQuote = quote !== null && quote.fxRateToChf > 0;
    const marketValueChf = hasUsableQuote ? quantity * quote.price * quote.fxRateToChf : null;
    const currentPriceChf = hasUsableQuote ? quote.price * quote.fxRateToChf : null;
    const todayPnlChf = hasUsableQuote && quote.previousClose !== null
      ? quantity * (quote.price - quote.previousClose) * quote.fxRateToChf
      : null;
    const unrealizedPnlChf = marketValueChf === null ? null : marketValueChf - costBasisChf;
    const totalPnlChf = unrealizedPnlChf === null ? null : unrealizedPnlChf + realizedPnlChf;

    positions.push({
      securityId,
      quantity,
      costBasisLocal,
      costBasisChf,
      averageCostLocal: quantity > EPSILON ? costBasisLocal / quantity : 0,
      averageCostChf: quantity > EPSILON ? costBasisChf / quantity : 0,
      grossPurchasesChf,
      realizedPnlChf,
      dividendIncomeChf,
      feesChf,
      accountPositions: accountBreakdown,
      security,
      quote,
      currentPrice: quote?.price ?? null,
      currentPriceChf,
      marketValueChf,
      todayPnlChf,
      unrealizedPnlChf,
      totalPnlChf,
      returnPercent: totalPnlChf === null || grossPurchasesChf <= EPSILON ? null : (totalPnlChf / grossPurchasesChf) * 100,
      portfolioWeight: null,
    });
  }

  const marketValueChf = positions.reduce((total, position) => total + (position.marketValueChf ?? 0), 0);
  const cashChf = calculateCashChf(validTransactions);
  const portfolioValueChf = marketValueChf + cashChf;
  const netContributionsChf = calculateNetContributionsChf(validTransactions);
  const investedCapitalChf = positions.reduce((total, position) => total + position.costBasisChf, 0);
  const unrealizedPnlChf = positions.reduce((total, position) => total + (position.unrealizedPnlChf ?? 0), 0);
  const portfolioLevelFeesChf = validTransactions.reduce(
    (total, transaction) => total + (transaction.type === "FEE" && transaction.securityId === null ? transaction.totalValueChf : 0),
    0,
  );
  const realizedPnlChf = positions.reduce((total, position) => total + position.realizedPnlChf, 0) - portfolioLevelFeesChf;
  const totalPnlChf = portfolioValueChf - netContributionsChf;
  const todayPnlChf = positions.reduce((total, position) => total + (position.todayPnlChf ?? 0), 0);
  const priorValue = portfolioValueChf - todayPnlChf;

  for (const position of positions) {
    position.portfolioWeight = position.marketValueChf === null || portfolioValueChf <= EPSILON
      ? null
      : (position.marketValueChf / portfolioValueChf) * 100;
  }

  positions.sort((left, right) => (right.marketValueChf ?? -Infinity) - (left.marketValueChf ?? -Infinity));

  return {
    positions,
    cashChf,
    investedCapitalChf,
    marketValueChf,
    portfolioValueChf,
    netContributionsChf,
    realizedPnlChf,
    unrealizedPnlChf,
    totalPnlChf,
    todayPnlChf,
    todayReturnPercent: Math.abs(priorValue) <= EPSILON ? 0 : (todayPnlChf / priorValue) * 100,
    totalReturnPercent: Math.abs(netContributionsChf) <= EPSILON ? 0 : (totalPnlChf / netContributionsChf) * 100,
    issues,
  };
}
