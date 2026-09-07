import type { SnapshotSource } from "./history";

export const chartRanges = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
export type ChartRange = (typeof chartRanges)[number];
export const chartResolutions = ["auto", "month", "week", "day", "hour", "minute"] as const;
export type ChartResolution = (typeof chartResolutions)[number];
type ResolvedChartResolution = Exclude<ChartResolution, "auto"> | "intraday";
export interface ChartSnapshot {
  timestamp: string;
  totalPnlChf: number;
  portfolioValueChf: number;
  isLive: boolean;
  source: SnapshotSource;
}
export type ChartPoint = ChartSnapshot & { time: number; displayValue: number };
const day = 86_400_000;
const rangeDays: Record<ChartRange, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 93, YTD: 0, "1Y": 366, ALL: Infinity };

function resolvedResolution(range: ChartRange, resolution: ChartResolution): ResolvedChartResolution {
  if (resolution !== "auto") return resolution;
  return range === "1D" || range === "1W" ? "intraday" : "day";
}

function bucketKey(time: number, resolution: Exclude<ChartResolution, "auto">) {
  const date = new Date(time);
  if (resolution === "minute") return Math.floor(time / 60_000);
  if (resolution === "hour") return Math.floor(time / 3_600_000);
  if (resolution === "day") return Math.floor(time / day);
  if (resolution === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset) / day);
  }
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

// Keep real observations (including extrema), never averaged or invented values.
// A fixed upper bound keeps SVG rendering and pointer lookup inexpensive.
export function compactChartPoints(points: ChartPoint[], maxPoints = 480): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const bucketCount = Math.floor((maxPoints - 2) / 4);
  const width = (points.at(-1)!.time - points[0].time + 1) / bucketCount;
  const buckets = new Map<number, ChartPoint[]>();
  for (const point of points.slice(1, -1)) {
    const key = Math.min(bucketCount - 1, Math.floor((point.time - points[0].time) / width));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  const result = [points[0]];
  for (const bucket of buckets.values()) {
    const low = bucket.reduce((a, b) => a.displayValue <= b.displayValue ? a : b);
    const high = bucket.reduce((a, b) => a.displayValue >= b.displayValue ? a : b);
    result.push(...[...new Set([bucket[0], low, high, bucket.at(-1)!])].sort((a, b) => a.time - b.time));
  }
  return [...result, points.at(-1)!];
}

export function prepareChartData(snapshots: ChartSnapshot[], range: ChartRange, metric: "pnl" | "value", resolution: ChartResolution = "auto") {
  const sorted = snapshots.map((point) => ({ ...point, time: Date.parse(point.timestamp), displayValue: metric === "pnl" ? point.totalPnlChf : point.portfolioValueChf }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.displayValue))
    .sort((a, b) => a.time - b.time);
  const displayPoint = sorted.at(-1);
  const comparable = sorted.filter((point) => point.source !== "LIVE_ESTIMATE");
  // Anchor to available market history, so weekends don't empty the day view.
  const end = comparable.at(-1)?.time ?? displayPoint?.time ?? 0;
  const cutoff = range === "YTD" ? Date.UTC(new Date(end).getUTCFullYear(), 0, 1) : end - rangeDays[range] * day;
  const selectedResolution = resolvedResolution(range, resolution);
  const dateOnly = selectedResolution === "month" || selectedResolution === "week" || selectedResolution === "day";
  let observations = comparable.filter((point) => point.time >= cutoff);
  if (selectedResolution !== "intraday") {
    const buckets = new Map<number, ChartPoint>();
    for (const point of observations) buckets.set(bucketKey(point.time, selectedResolution), point);
    observations = [...buckets.values()];
  }
  const first = observations.at(0)?.displayValue ?? 0;
  const last = observations.at(-1)?.displayValue ?? 0;
  return {
    data: compactChartPoints(observations),
    fullData: observations,
    observationCount: observations.length,
    displayPoint,
    chartValue: observations.at(-1)?.displayValue ?? displayPoint?.displayValue ?? 0,
    change: last - first,
    low: observations.reduce((value, point) => Math.min(value, point.displayValue), last),
    high: observations.reduce((value, point) => Math.max(value, point.displayValue), last),
    daily: dateOnly,
    resolution: selectedResolution,
  };
}

// Canvas time keys must be unique and strictly increasing. Retain the last
// valuation in each UTC day/second and keep its original timestamp for inspection.
export function indexChartPoints(points: ChartPoint[], daily: boolean) {
  const indexed = new Map<number, ChartPoint>();
  for (const point of points) {
    const key = daily ? Math.floor(point.time / day) * 86400 : Math.floor(point.time / 1000);
    indexed.set(key, point);
  }
  return indexed;
}
