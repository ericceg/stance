"use client";

import { useMemo, useState } from "react";
import { Activity, ChartNoAxesCombined, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate, formatChf } from "@/lib/format";

const ranges = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof ranges)[number];
type Metric = "pnl" | "value";

const rangeDays: Record<Range, number> = {
  "1D": 1, "1W": 7, "1M": 31, "3M": 93, YTD: 0, "1Y": 366, ALL: Infinity,
};

interface PortfolioChartProps {
  hasTransactions: boolean;
  recordedSnapshotCount: number;
  snapshots: { timestamp: string; totalPnlChf: number; portfolioValueChf: number; isLive: boolean }[];
}

type ChartPoint = PortfolioChartProps["snapshots"][number] & {
  time: number;
  displayValue: number;
};

function axisLabel(timestamp: number, range: Range) {
  const date = new Date(timestamp);
  if (range === "1D") return new Intl.DateTimeFormat("en-CH", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (range === "1W" || range === "1M") return new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short" }).format(date);
  return formatChartDate(date);
}

function tooltipDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-CH", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(timestamp));
}

export function PortfolioChart({ hasTransactions, recordedSnapshotCount, snapshots }: PortfolioChartProps) {
  const [range, setRange] = useState<Range>("1M");
  const [metric, setMetric] = useState<Metric>("pnl");
  const data = useMemo<ChartPoint[]>(() => {
    if (snapshots.length === 0) return [];
    const end = new Date(snapshots.at(-1)!.timestamp).getTime();
    const endDate = new Date(end);
    const cutoff = range === "YTD" ? Date.UTC(endDate.getUTCFullYear(), 0, 1) : end - rangeDays[range] * 86_400_000;
    return snapshots.filter((snapshot) => new Date(snapshot.timestamp).getTime() >= cutoff).map((snapshot) => ({
      ...snapshot,
      time: new Date(snapshot.timestamp).getTime(),
      displayValue: metric === "pnl" ? snapshot.totalPnlChf : snapshot.portfolioValueChf,
    }));
  }, [metric, range, snapshots]);

  const first = data.at(0)?.displayValue ?? 0;
  const last = data.at(-1)?.displayValue ?? 0;
  const change = last - first;
  const low = data.reduce((value, point) => Math.min(value, point.displayValue), last);
  const high = data.reduce((value, point) => Math.max(value, point.displayValue), last);
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;
  const label = metric === "pnl" ? "Total P&L" : "Portfolio value";
  const rangeLabel = range === "ALL" ? "All recorded history" : `${range} performance`;

  return (
    <section className="panel terminal-chart-panel">
      <header className="terminal-chart-header">
        <div className="terminal-chart-title">
          <div className="terminal-kicker"><Activity aria-hidden="true" /> Performance</div>
          <div className="terminal-value-row">
            <strong>{formatChf(last, { signed: metric === "pnl" })}</strong>
            <span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}{formatChf(change, { signed: true })}</span>
          </div>
          <p>{label} · {rangeLabel}</p>
        </div>
        <div className="terminal-chart-controls">
          <div className="metric-tabs" aria-label="Chart metric">
            <button className={metric === "pnl" ? "is-active" : ""} onClick={() => setMetric("pnl")} type="button">P&amp;L</button>
            <button className={metric === "value" ? "is-active" : ""} onClick={() => setMetric("value")} type="button">Value</button>
          </div>
          <div className="range-tabs" aria-label="Chart time range">
            {ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}
          </div>
        </div>
      </header>

      {hasTrend ? <>
        <div className="terminal-chart-stats" aria-label={`${label} range statistics`}>
          <div><span>Period change</span><strong className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}</strong></div>
          <div><span>Period high</span><strong>{formatChf(high, { signed: metric === "pnl" })}</strong></div>
          <div><span>Period low</span><strong>{formatChf(low, { signed: metric === "pnl" })}</strong></div>
          <div><span>Observations</span><strong>{data.length}</strong></div>
        </div>
        <div className="terminal-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 48, left: 4, bottom: 2 }}>
              <defs><linearGradient id="portfolioTerminalFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart)" stopOpacity={0.38} /><stop offset="72%" stopColor="var(--chart)" stopOpacity={0.06} /><stop offset="100%" stopColor="var(--chart)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 5" />
              <XAxis type="number" dataKey="time" scale="time" domain={["dataMin", "dataMax"]} axisLine={false} tickLine={false} tickCount={range === "1D" ? 8 : 7} tickFormatter={(value) => axisLabel(value, range)} tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis width={44} orientation="right" axisLine={false} tickLine={false} tickCount={5} tickFormatter={(value) => formatChf(value).replace("CHF ", "")} tick={{ fill: "var(--muted)", fontFamily: "var(--font-geist-mono)", fontSize: 9 }} domain={([minimum, maximum]: readonly [number, number]) => { const padding = Math.max((maximum - minimum) * 0.12, 10); return [minimum - padding, maximum + padding]; }} />
              {metric === "pnl" ? <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 4" /> : null}
              <Tooltip cursor={{ stroke: "var(--chart)", strokeOpacity: 0.55, strokeDasharray: "3 4" }} content={({ active, payload }) => { const point = payload?.[0]?.payload as ChartPoint | undefined; return active && point ? <div className="terminal-tooltip"><span>{tooltipDate(point.timestamp)}</span><strong>{formatChf(point.displayValue, { signed: metric === "pnl" })}</strong><small>{point.isLive ? "Live portfolio value" : "Recorded snapshot"}</small></div> : null; }} />
              <Area type="linear" dataKey="displayValue" stroke="var(--chart)" strokeWidth={2.25} fill="url(#portfolioTerminalFill)" activeDot={{ r: 4, fill: "var(--surface-strong)", stroke: "var(--chart)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div>{hasTransactions ? <><strong>Performance history starts here at {formatChf(last, { signed: true })}</strong><p>Refresh prices again to capture the next performance point.</p></> : <><strong>No portfolio history yet</strong><p>Add or import a transaction to start tracking portfolio performance.</p></>}</div></div>}
      <footer className="terminal-chart-footer"><span><i aria-hidden="true" />Live and recorded marks</span><span>Daily closes are rebuilt from market history · Price refreshes add intraday marks</span></footer>
    </section>
  );
}
