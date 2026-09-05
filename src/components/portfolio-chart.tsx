"use client";

import { useMemo, useState } from "react";
import { Activity, ChartNoAxesCombined, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate, formatChf } from "@/lib/format";

import { chartRanges as ranges, prepareChartData, type ChartRange as Range, type ChartPoint, type ChartSnapshot } from "@/lib/portfolio/chart-data";

type Metric = "pnl" | "value";
interface PortfolioChartProps {
  hasTransactions: boolean;
  recordedSnapshotCount: number;
  snapshots: ChartSnapshot[];
}

function axisLabel(timestamp: number, range: Range) {
  const date = new Date(timestamp);
  if (range === "1D") return new Intl.DateTimeFormat("en-CH", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (range === "1W" || range === "1M") return new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
  return formatChartDate(date);
}

function tooltipDate(point: ChartPoint) {
  if (point.source === "HISTORICAL_CLOSE") {
    return `${new Intl.DateTimeFormat("en-CH", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
    }).format(new Date(point.timestamp))} · Market close`;
  }
  return new Intl.DateTimeFormat("en-CH", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(point.timestamp));
}

export function PortfolioChart({ hasTransactions, recordedSnapshotCount, snapshots }: PortfolioChartProps) {
  const [range, setRange] = useState<Range>("1M");
  const [metric, setMetric] = useState<Metric>("pnl");
  const { data, observationCount, displayPoint, chartValue, change, low, high, daily } = useMemo(
    () => prepareChartData(snapshots, range, metric), [snapshots, range, metric],
  );
  const ticks = useMemo(() => {
    if (data.length < 2) return undefined;
    const start = data[0].time;
    const end = data.at(-1)!.time;
    // Explicit ticks prevent the time scale from generating duplicate date labels.
    return [...new Map(Array.from({ length: 6 }, (_, index) => {
      const time = start + (end - start) * index / 5;
      return [axisLabel(time, range), time] as const;
    })).values()];
  }, [data, range]);
  const liveEstimate = displayPoint?.source === "LIVE_ESTIMATE" ? displayPoint.displayValue : null;
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;
  const label = metric === "pnl" ? "Total P&L" : "Portfolio value";
  const rangeLabel = range === "ALL" ? "All recorded history" : `${range} performance`;

  return (
    <section className="panel terminal-chart-panel">
      <header className="terminal-chart-header">
        <div className="terminal-chart-title">
          <div className="terminal-kicker"><Activity aria-hidden="true" /> Performance</div>
          <div className="terminal-value-row">
            <strong>{formatChf(chartValue, { signed: metric === "pnl" })}</strong>
            <span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}{formatChf(change, { signed: true })}</span>
          </div>
          <p>{label} · {rangeLabel} · {daily ? "Daily valuations" : "Intraday"}</p>
          {liveEstimate !== null ? <div className="terminal-live-estimate"><span>Live estimate</span><strong>{formatChf(liveEstimate, { signed: metric === "pnl" })}</strong><small>mixed quotes · not plotted</small></div> : null}
        </div>
        <div className="terminal-chart-controls">
          <div className="metric-tabs" aria-label="Chart metric">
            <button className={metric === "pnl" ? "is-active" : ""} aria-pressed={metric === "pnl"} onClick={() => setMetric("pnl")} type="button">P&amp;L</button>
            <button className={metric === "value" ? "is-active" : ""} aria-pressed={metric === "value"} onClick={() => setMetric("value")} type="button">Value</button>
          </div>
          <div className="range-tabs" aria-label="Chart time range">
            {ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} aria-pressed={item === range} onClick={() => setRange(item)} type="button">{item}</button>)}
          </div>
        </div>
      </header>

      {hasTrend ? <>
        <div className="terminal-chart-stats" aria-label={`${label} range statistics`}>
          <div><span>Period change</span><strong className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}</strong></div>
          <div><span>{daily ? "Daily high" : "Period high"}</span><strong>{formatChf(high, { signed: metric === "pnl" })}</strong></div>
          <div><span>{daily ? "Daily low" : "Period low"}</span><strong>{formatChf(low, { signed: metric === "pnl" })}</strong></div>
          <div><span>Resolution</span><strong>{daily ? `${observationCount} daily marks` : "Intraday marks"}</strong></div>
        </div>
        <div className="terminal-chart-wrap">
          <ResponsiveContainer width="100%" height="100%" debounce={100}>
            <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 2 }}>
              <defs><linearGradient id="portfolioTerminalFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart)" stopOpacity={0.38} /><stop offset="72%" stopColor="var(--chart)" stopOpacity={0.06} /><stop offset="100%" stopColor="var(--chart)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" />
              <XAxis type="number" dataKey="time" scale="time" domain={["dataMin", "dataMax"]} axisLine={false} tickLine={false} ticks={ticks} minTickGap={36} interval="preserveStartEnd" tickFormatter={(value) => axisLabel(value, range)} tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis width={76} orientation="right" axisLine={false} tickLine={false} tickCount={5} tickFormatter={(value) => formatChf(value).replace("CHF ", "")} tick={{ fill: "var(--muted)", fontFamily: "var(--font-geist-mono)", fontSize: 9 }} domain={([minimum, maximum]: readonly [number, number]) => { const padding = Math.max((maximum - minimum) * 0.12, 10); return [minimum - padding, maximum + padding]; }} />
              {metric === "pnl" ? <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 4" /> : null}
              <Tooltip isAnimationActive={false} cursor={{ stroke: "var(--chart)", strokeOpacity: 0.55, strokeDasharray: "3 4" }} content={({ active, payload }) => { const point = payload?.[0]?.payload as ChartPoint | undefined; return active && point ? <div className="terminal-tooltip"><span>{tooltipDate(point)}</span><strong>{formatChf(point.displayValue, { signed: metric === "pnl" })}</strong><small>{point.source === "HISTORICAL_CLOSE" ? "Historical closing valuation" : "Comparable intraday snapshot"}</small></div> : null; }} />
              <Area isAnimationActive={false} dot={false} type="linear" dataKey="displayValue" stroke="var(--chart)" strokeWidth={2.25} fill="url(#portfolioTerminalFill)" activeDot={{ r: 4, fill: "var(--surface-strong)", stroke: "var(--chart)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div>{hasTransactions ? <><strong>Performance history starts here at {formatChf(chartValue, { signed: metric === "pnl" })}</strong><p>Try a longer range or refresh prices to add another valuation.</p></> : <><strong>No portfolio history yet</strong><p>Add or import a transaction to start tracking portfolio performance.</p></>}</div></div>}
      <footer className="terminal-chart-footer"><span><i aria-hidden="true" />{daily ? "Daily valuations" : "Comparable intraday prices"}</span><span>{daily ? "One last available valuation per day. Select 1D or 1W for intraday detail." : "Intraday detail is available for the most recent 7 days. Older history uses daily valuations."}{liveEstimate !== null ? " Live estimates are excluded." : ""}</span></footer>
    </section>
  );
}
