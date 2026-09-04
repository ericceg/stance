"use client";

import { useMemo, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate, formatChf } from "@/lib/format";

const ranges = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof ranges)[number];

const rangeDays: Record<Range, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 31,
  "3M": 93,
  YTD: 0,
  "1Y": 366,
  ALL: Infinity,
};

interface PortfolioChartProps {
  hasTransactions: boolean;
  recordedSnapshotCount: number;
  snapshots: { timestamp: string; totalPnlChf: number }[];
}

export function PortfolioChart({ hasTransactions, recordedSnapshotCount, snapshots }: PortfolioChartProps) {
  const [range, setRange] = useState<Range>("1M");
  const data = useMemo(() => {
    if (snapshots.length === 0) return [];
    const end = new Date(snapshots.at(-1)!.timestamp).getTime();
    const endDate = new Date(end);
    const cutoff = range === "YTD"
      ? Date.UTC(endDate.getUTCFullYear(), 0, 1)
      : end - rangeDays[range] * 86_400_000;
    const filtered = snapshots.filter((snapshot) => new Date(snapshot.timestamp).getTime() >= cutoff);
    return filtered.map((snapshot) => ({
      ...snapshot,
      dateLabel: range === "1D"
        ? new Intl.DateTimeFormat("en-CH", { hour: "2-digit", minute: "2-digit" }).format(new Date(snapshot.timestamp))
        : formatChartDate(snapshot.timestamp),
      tooltipLabel: new Intl.DateTimeFormat("en-CH", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date(snapshot.timestamp)),
    }));
  }, [range, snapshots]);

  const first = data.at(0)?.totalPnlChf ?? 0;
  const last = data.at(-1)?.totalPnlChf ?? 0;
  const change = last - first;
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;

  return (
    <section className="panel chart-panel">
      <div className="section-heading chart-heading">
        <div><p>Total P&amp;L</p><h2>{range === "ALL" ? "All recorded history" : `Performance · ${range}`}</h2></div>
        <div className="range-tabs" aria-label="Chart time range">
          {ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}
        </div>
      </div>
      {hasTrend ? (
        <>
          <div className="chart-delta"><span className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}</span><small>change in total P&amp;L over selected period</small></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="var(--chart)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="dateLabel"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={range === "1D" ? 20 : 32}
                  tickCount={range === "1D" ? 8 : 10}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis hide domain={([minimum, maximum]: readonly [number, number]) => {
                  const padding = Math.max((maximum - minimum) * 0.12, 10);
                  return [minimum - padding, maximum + padding];
                }} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-strong)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)" }}
                  formatter={(value) => [formatChf(Number(value), { signed: true }), "Total P&L"]}
                  labelFormatter={(_, payload) => payload[0]?.payload.tooltipLabel ?? ""}
                  labelStyle={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="totalPnlChf" stroke="var(--chart)" strokeWidth={2.5} fill="url(#portfolioFill)" activeDot={{ r: 4, fill: "var(--chart)", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div>{hasTransactions ? <><strong>Performance history starts here at {formatChf(last, { signed: true })}</strong><p>PersPort records total P&amp;L after every import or sync. One more recorded snapshot is needed to draw a trend.</p></> : <><strong>No portfolio history yet</strong><p>Add or import a transaction to start tracking portfolio performance.</p></>}</div></div>
      )}
      <p className="chart-note">Total P&amp;L is unrealized plus realized gain or loss, so deposits and withdrawals do not appear as performance. Daily closes are rebuilt from market history; every price refresh adds an intraday point.</p>
    </section>
  );
}
