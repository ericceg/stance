import { calculatePortfolio } from "./accounting";
import type { AccountingTransaction, BrokerAccountRecord, SecurityRecord } from "./types";
import type { RecordedPortfolioSnapshot, SnapshotSource } from "./history";

const DAY_MS = 86_400_000;
const EPSILON = 1e-9;

export interface RecordedSecuritySnapshot {
  securityId: string;
  timestamp: Date;
  marketValueChf: number;
  totalPnlChf: number;
  source?: SnapshotSource;
}

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

interface ReconstructionInput {
  transactions: AccountingTransaction[];
  securities: SecurityRecord[];
  brokerAccounts: BrokerAccountRecord[];
  valuations: HistoricalValuationPoint[];
}

function prepareReconstruction(input: ReconstructionInput) {
  const transactions = [...input.transactions].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  const valuationsBySecurity = new Map<string, HistoricalValuationPoint[]>();
  for (const valuation of [...input.valuations].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())) {
    const points = valuationsBySecurity.get(valuation.securityId) ?? [];
    points.push(valuation);
    valuationsBySecurity.set(valuation.securityId, points);
  }
  return { transactions, valuationsBySecurity };
}

function reconstructAt(input: ReconstructionInput, prepared: ReturnType<typeof prepareReconstruction>, timestamp: Date, source?: SnapshotSource) {
  const time = timestamp.getTime();
  const transactions = prepared.transactions.filter((transaction) => transaction.timestamp.getTime() <= time);
  const quotes = input.securities.flatMap((security) => {
    const valuation = prepared.valuationsBySecurity.get(security.id)?.findLast((point) => point.timestamp.getTime() <= time);
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
    transactions,
    securities: input.securities,
    brokerAccounts: input.brokerAccounts,
    quotes,
  });
  const hasUnpricedPosition = summary.positions.some((position) => position.quantity > EPSILON && position.marketValueChf === null);
  if (hasUnpricedPosition) return null;
  return {
    portfolio: {
      timestamp,
      portfolioValueChf: summary.portfolioValueChf,
      investedCapitalChf: summary.investedCapitalChf,
      cashChf: summary.cashChf,
      unrealizedPnlChf: summary.unrealizedPnlChf,
      realizedPnlChf: summary.realizedPnlChf,
      source,
    } satisfies RecordedPortfolioSnapshot,
    securities: summary.positions.map((position) => ({
      securityId: position.securityId,
      timestamp,
      marketValueChf: position.marketValueChf ?? 0,
      totalPnlChf: (position.unrealizedPnlChf ?? 0) + position.realizedPnlChf,
      source,
    } satisfies RecordedSecuritySnapshot)),
  };
}

export function reconstructDailyPortfolioSnapshots(input: {
  transactions: AccountingTransaction[];
  securities: SecurityRecord[];
  brokerAccounts: BrokerAccountRecord[];
  valuations: HistoricalValuationPoint[];
  currentTimestamp?: Date;
}) {
  if (input.transactions.length === 0) return { snapshots: [], securitySnapshots: [], skippedDays: 0 };

  const prepared = prepareReconstruction(input);

  const firstDay = utcDayStart(prepared.transactions[0].timestamp).getTime();
  const today = utcDayStart(input.currentTimestamp ?? new Date()).getTime();
  const snapshots: RecordedPortfolioSnapshot[] = [];
  const securitySnapshots: RecordedSecuritySnapshot[] = [];
  let skippedDays = 0;

  for (let day = firstDay; day < today; day += DAY_MS) {
    const dayEnd = day + DAY_MS - 1;
    const snapshot = reconstructAt(input, prepared, new Date(dayEnd), "HISTORICAL_CLOSE");
    if (!snapshot) {
      skippedDays += 1;
      continue;
    }
    snapshots.push(snapshot.portfolio);
    securitySnapshots.push(...snapshot.securities);
  }

  return { snapshots, securitySnapshots, skippedDays };
}

export function reconstructIntradayPortfolioSnapshots(input: ReconstructionInput & { timestamps: Date[] }) {
  if (input.transactions.length === 0) return { snapshots: [], securitySnapshots: [], skippedPoints: 0 };
  const prepared = prepareReconstruction(input);
  const timestamps = [...new Map(input.timestamps.map((timestamp) => [timestamp.getTime(), timestamp])).values()]
    .sort((left, right) => left.getTime() - right.getTime());
  const snapshots: RecordedPortfolioSnapshot[] = [];
  const securitySnapshots: RecordedSecuritySnapshot[] = [];
  let skippedPoints = 0;
  for (const timestamp of timestamps) {
    const snapshot = reconstructAt(input, prepared, timestamp, "INTRADAY_COMPARABLE");
    if (snapshot) {
      snapshots.push(snapshot.portfolio);
      securitySnapshots.push(...snapshot.securities);
    }
    else skippedPoints += 1;
  }
  return { snapshots, securitySnapshots, skippedPoints };
}
