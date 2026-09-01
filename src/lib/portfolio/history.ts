export interface RecordedPortfolioSnapshot {
  timestamp: Date;
  portfolioValueChf: number;
  investedCapitalChf: number;
  cashChf: number;
}

export interface PortfolioHistoryPoint {
  timestamp: string;
  portfolioValueChf: number;
  investedCapitalChf: number;
  cashChf: number;
  isLive: boolean;
}

export function buildPortfolioHistory(input: {
  snapshots: RecordedPortfolioSnapshot[];
  current: Omit<RecordedPortfolioSnapshot, "timestamp">;
  hasTransactions: boolean;
  importedDataStartedAt: Date | null;
  currentTimestamp?: Date;
}) {
  const trustedSnapshots = !input.hasTransactions
    ? []
    : input.importedDataStartedAt === null
    ? input.snapshots
    : input.snapshots.filter((snapshot) => snapshot.timestamp >= input.importedDataStartedAt!);
  const latestRecordedTimestamp = trustedSnapshots.at(-1)?.timestamp.getTime() ?? 0;
  const requestedCurrentTimestamp = (input.currentTimestamp ?? new Date()).getTime();
  const currentTimestamp = new Date(Math.max(requestedCurrentTimestamp, latestRecordedTimestamp + 1));

  const points: PortfolioHistoryPoint[] = trustedSnapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp.toISOString(),
    portfolioValueChf: snapshot.portfolioValueChf,
    investedCapitalChf: snapshot.investedCapitalChf,
    cashChf: snapshot.cashChf,
    isLive: false,
  }));
  points.push({
    timestamp: currentTimestamp.toISOString(),
    portfolioValueChf: input.current.portfolioValueChf,
    investedCapitalChf: input.current.investedCapitalChf,
    cashChf: input.current.cashChf,
    isLive: true,
  });

  return {
    points,
    recordedPointCount: trustedSnapshots.length,
  };
}
