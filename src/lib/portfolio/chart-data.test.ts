import { describe, expect, it } from "vitest";
import { prepareChartData, type ChartSnapshot } from "./chart-data";

function point(timestamp: string, value: number, source: ChartSnapshot["source"] = "INTRADAY_COMPARABLE"): ChartSnapshot {
  return { timestamp, totalPnlChf: value, portfolioValueChf: value + 1000, source, isLive: source === "LIVE_ESTIMATE" };
}

describe("performance chart resolution", () => {
  it("uses one final valuation per day across sparse and dense history", () => {
    const snapshots = [
      point("2026-08-20T23:59:59Z", 10, "HISTORICAL_CLOSE"),
      point("2026-09-03T09:00:00Z", 500),
      point("2026-09-03T12:00:00Z", -100),
      point("2026-09-03T23:59:59Z", 20, "HISTORICAL_CLOSE"),
      point("2026-09-04T09:00:00Z", 25),
      point("2026-09-04T10:00:00Z", 30),
      point("2026-09-05T10:00:00Z", 999, "LIVE_ESTIMATE"),
    ];
    const result = prepareChartData(snapshots, "1M", "pnl");
    expect(result.data.map((p) => p.displayValue)).toEqual([10, 20, 30]);
    expect(result).toMatchObject({ change: 20, low: 10, high: 30, observationCount: 3, chartValue: 30 });
    expect(result.displayPoint?.displayValue).toBe(999);
    expect(prepareChartData(snapshots, "1W", "pnl").low).toBe(-100);
  });

  it("bounds dense intraday rendering while preserving endpoints and extremes", () => {
    const start = Date.parse("2026-09-04T00:00:00Z");
    const snapshots = Array.from({ length: 10000 }, (_, i) => point(new Date(start + i * 1000).toISOString(), i === 4567 ? -500 : i === 7890 ? 20000 : i));
    const result = prepareChartData(snapshots, "1D", "pnl");
    expect(result.data.length).toBeLessThanOrEqual(480);
    expect(result.data[0].displayValue).toBe(0);
    expect(result.data.at(-1)?.displayValue).toBe(9999);
    expect(Math.min(...result.data.map((p) => p.displayValue))).toBe(-500);
    expect(Math.max(...result.data.map((p) => p.displayValue))).toBe(20000);
    expect(result.observationCount).toBe(10000);
    expect(result.data.every((p, i, all) => i === 0 || p.time >= all[i - 1].time)).toBe(true);
  });

  it("anchors short ranges to the last comparable mark through a weekend", () => {
    const snapshots = [point("2026-09-04T09:00:00Z", 10), point("2026-09-04T17:00:00Z", 20), point("2026-09-06T12:00:00Z", 50, "LIVE_ESTIMATE")];
    expect(prepareChartData(snapshots, "1D", "value").data.map((p) => p.displayValue)).toEqual([1010, 1020]);
  });

  it("handles empty history, unordered input and the YTD boundary", () => {
    expect(prepareChartData([], "ALL", "pnl").data).toEqual([]);
    const snapshots = [point("2026-01-02T12:00:00Z", 20), point("2025-12-31T12:00:00Z", 5), point("2026-01-01T12:00:00Z", 10)];
    expect(prepareChartData(snapshots, "YTD", "pnl").data.map((p) => p.displayValue)).toEqual([10, 20]);
    expect(prepareChartData(snapshots, "ALL", "pnl").change).toBe(15);
  });
});
