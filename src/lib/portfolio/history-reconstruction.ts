import { calculatePortfolio } from "./accounting";
import type { AccountingTransaction, BrokerAccountRecord, SecurityRecord } from "./types";
import type { RecordedPortfolioSnapshot } from "./history";

const DAY_MS = 86_400_000;
const EPSILON = 1e-9;

export interface HistoricalValuationPoint {
  securityId: string;
  timestamp: Date;
  price: number;
  currency: string;
  fxRateToChf: number;
}

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function reconstructDailyPortfolioSnapshots(input: {
  transactions: AccountingTransaction[];
  securities: SecurityRecord[];
  brokerAccounts: BrokerAccountRecord[];
  valuations: HistoricalValuationPoint[];
  currentTimestamp?: Date;
}) {
  if (input.transactions.length === 0) return { snapshots: [], skippedDays: 0 };

  const transactions = [...input.transactions].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  const valuationsBySecurity = new Map<string, HistoricalValuationPoint[]>();
  for (const valuation of [...input.valuations].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())) {
    const points = valuationsBySecurity.get(valuation.securityId) ?? [];
    points.push(valuation);
    valuationsBySecurity.set(valuation.securityId, points);
  }

  const firstDay = utcDayStart(transactions[0].timestamp).getTime();
  const today = utcDayStart(input.currentTimestamp ?? new Date()).getTime();
  const snapshots: RecordedPortfolioSnapshot[] = [];
  let skippedDays = 0;

  for (let day = firstDay; day < today; day += DAY_MS) {
    const dayEnd = day + DAY_MS - 1;
    const dayTransactions = transactions.filter((transaction) => transaction.timestamp.getTime() <= dayEnd);
    const quotes = input.securities.flatMap((security) => {
      const valuation = valuationsBySecurity.get(security.id)?.findLast((point) => point.timestamp.getTime() <= dayEnd);
      if (!valuation) return [];
      return [{
        securityId: security.id,
        price: valuation.price,
        previousClose: null,
        currency: valuation.currency,
        fxRateToChf: valuation.fxRateToChf,
        provider: "HISTORICAL",
        quotedAt: valuation.timestamp,
      }];
    });
    const summary = calculatePortfolio({
      transactions: dayTransactions,
      securities: input.securities,
      brokerAccounts: input.brokerAccounts,
      quotes,
    });
    const hasUnpricedPosition = summary.positions.some((position) => position.quantity > EPSILON && position.marketValueChf === null);
    if (hasUnpricedPosition) {
      skippedDays += 1;
      continue;
    }
    snapshots.push({
      timestamp: new Date(dayEnd),
      portfolioValueChf: summary.portfolioValueChf,
      investedCapitalChf: summary.investedCapitalChf,
      cashChf: summary.cashChf,
      unrealizedPnlChf: summary.unrealizedPnlChf,
      realizedPnlChf: summary.realizedPnlChf,
    });
  }

  return { snapshots, skippedDays };
}
