export interface RecordedPortfolioSnapshot {
  timestamp: Date;
  portfolioValueChf: number;
  investedCapitalChf: number;
  cashChf: number;
  unrealizedPnlChf: number;
  realizedPnlChf: number;
  source?: SnapshotSource;
}

export type SnapshotSource = "HISTORICAL_CLOSE" | "INTRADAY_COMPARABLE" | "LIVE_ESTIMATE";

export interface PortfolioHistoryPoint {
  timestamp: string;
  portfolioValueChf: number;
  investedCapitalChf: number;
  cashChf: number;
  totalPnlChf: number;
  isLive: boolean;
  source: SnapshotSource;
}

export function buildPortfolioHistory(input: {
  snapshots: RecordedPortfolioSnapshot[];
  current: Omit<RecordedPortfolioSnapshot, "timestamp">;
  hasTransactions: boolean;
  currentTimestamp?: Date;
  currentSource?: SnapshotSource;
}) {
  const trustedSnapshots = input.hasTransactions ? input.snapshots : [];
  // Snapshots are taken after a price refresh as well as after an import. Keep
  // every recorded timestamp so the 1D and 1W views can show intraday moves.
  // Historical reconstruction still contributes its daily closing points.
  const recordedSnapshots = [...trustedSnapshots].sort((left, right) => (
    left.timestamp.getTime() - right.timestamp.getTime()
  ));
  const latestRecordedTimestamp = recordedSnapshots.at(-1)?.timestamp.getTime() ?? 0;
  const requestedCurrentTimestamp = (input.currentTimestamp ?? new Date()).getTime();
  const currentTimestamp = new Date(Math.max(requestedCurrentTimestamp, latestRecordedTimestamp + 1));

  const points: PortfolioHistoryPoint[] = recordedSnapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp.toISOString(),
    portfolioValueChf: snapshot.portfolioValueChf,
    investedCapitalChf: snapshot.investedCapitalChf,
    cashChf: snapshot.cashChf,
    totalPnlChf: snapshot.unrealizedPnlChf + snapshot.realizedPnlChf,
    isLive: false,
    source: snapshot.source ?? "HISTORICAL_CLOSE",
  }));
  points.push({
    timestamp: currentTimestamp.toISOString(),
    portfolioValueChf: input.current.portfolioValueChf,
    investedCapitalChf: input.current.investedCapitalChf,
    cashChf: input.current.cashChf,
    totalPnlChf: input.current.unrealizedPnlChf + input.current.realizedPnlChf,
    isLive: true,
    source: input.currentSource ?? "LIVE_ESTIMATE",
  });

  return {
    points,
    recordedPointCount: recordedSnapshots.length,
  };
}
