import { describe, expect, it } from "vitest";
import { buildPortfolioHistory, type RecordedPortfolioSnapshot } from "./history";

function snapshot(timestamp: string, portfolioValueChf: number): RecordedPortfolioSnapshot {
  return {
    timestamp: new Date(timestamp),
    portfolioValueChf,
    investedCapitalChf: portfolioValueChf - 100,
    cashChf: 100,
    unrealizedPnlChf: 75,
    realizedPnlChf: 25,
  };
}

describe("portfolio history", () => {
  it("excludes demo snapshots from before the first real import", () => {
    const history = buildPortfolioHistory({
      snapshots: [
        snapshot("2026-08-31T18:00:00Z", 57_563),
        snapshot("2026-09-01T06:00:00Z", 12_000),
      ],
      current: { portfolioValueChf: 12_250, investedCapitalChf: 10_000, cashChf: 2_250, unrealizedPnlChf: 125, realizedPnlChf: 25 },
      hasTransactions: true,
      importedDataStartedAt: new Date("2026-08-31T19:05:00Z"),
      currentTimestamp: new Date("2026-09-01T08:00:00Z"),
    });

    expect(history.recordedPointCount).toBe(1);
    expect(history.points.map((point) => point.portfolioValueChf)).toEqual([12_000, 12_250]);
    expect(history.points.map((point) => point.totalPnlChf)).toEqual([100, 150]);
    expect(history.points.at(-1)?.isLive).toBe(true);
  });

  it("keeps seeded history when no real import has replaced the demo portfolio", () => {
    const history = buildPortfolioHistory({
      snapshots: [snapshot("2026-08-30T18:00:00Z", 57_000), snapshot("2026-08-31T18:00:00Z", 57_563)],
      current: { portfolioValueChf: 57_563, investedCapitalChf: 40_000, cashChf: 12_000, unrealizedPnlChf: 5_000, realizedPnlChf: 200 },
      hasTransactions: true,
      importedDataStartedAt: null,
      currentTimestamp: new Date("2026-09-01T08:00:00Z"),
    });

    expect(history.recordedPointCount).toBe(2);
    expect(history.points).toHaveLength(3);
  });

  it("discards stale snapshots when the transaction ledger is empty", () => {
    const history = buildPortfolioHistory({
      snapshots: [snapshot("2026-08-31T18:00:00Z", 57_563)],
      current: { portfolioValueChf: 0, investedCapitalChf: 0, cashChf: 0, unrealizedPnlChf: 0, realizedPnlChf: 0 },
      hasTransactions: false,
      importedDataStartedAt: null,
      currentTimestamp: new Date("2026-09-01T08:00:00Z"),
    });

    expect(history.recordedPointCount).toBe(0);
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({ portfolioValueChf: 0, isLive: true });
  });

  it("keeps the live point chronologically after a future-dated recorded snapshot", () => {
    const history = buildPortfolioHistory({
      snapshots: [snapshot("2026-09-02T08:00:00Z", 12_000)],
      current: { portfolioValueChf: 12_250, investedCapitalChf: 10_000, cashChf: 2_250, unrealizedPnlChf: 125, realizedPnlChf: 25 },
      hasTransactions: true,
      importedDataStartedAt: new Date("2026-09-01T08:00:00Z"),
      currentTimestamp: new Date("2026-09-01T08:00:00Z"),
    });

    expect(new Date(history.points.at(-1)!.timestamp).getTime()).toBe(
      new Date("2026-09-02T08:00:00Z").getTime() + 1,
    );
  });

  it("keeps only the final complete snapshot from each import day", () => {
    const history = buildPortfolioHistory({
      snapshots: [
        snapshot("2026-09-01T08:00:00Z", 500),
        { ...snapshot("2026-09-01T09:00:00Z", 1_000), unrealizedPnlChf: 180, realizedPnlChf: 20 },
      ],
      current: { portfolioValueChf: 1_000, investedCapitalChf: 800, cashChf: 100, unrealizedPnlChf: 180, realizedPnlChf: 20 },
      hasTransactions: true,
      importedDataStartedAt: new Date("2026-09-01T07:00:00Z"),
      currentTimestamp: new Date("2026-09-01T10:00:00Z"),
    });

    expect(history.recordedPointCount).toBe(1);
    expect(history.points).toHaveLength(2);
    expect(history.points[0]).toMatchObject({ portfolioValueChf: 1_000, totalPnlChf: 200 });
  });
});
