"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate, formatChf } from "@/lib/format";

const ranges = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof ranges)[number];

const rangeDays: Record<Range, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 31,
  "3M": 93,
  YTD: 366,
  "1Y": 366,
  ALL: Infinity,
};

export function PortfolioChart({ snapshots }: { snapshots: { timestamp: string; portfolioValueChf: number }[] }) {
  const [range, setRange] = useState<Range>("1M");
  const data = useMemo(() => {
    if (snapshots.length === 0) return [];
    const end = new Date(snapshots.at(-1)!.timestamp).getTime();
    const cutoff = end - rangeDays[range] * 86_400_000;
    const filtered = snapshots.filter((snapshot) => new Date(snapshot.timestamp).getTime() >= cutoff);
    return (filtered.length >= 2 ? filtered : snapshots.slice(-2)).map((snapshot) => ({
      ...snapshot,
      dateLabel: formatChartDate(snapshot.timestamp),
    }));
  }, [range, snapshots]);

  const first = data.at(0)?.portfolioValueChf ?? 0;
  const last = data.at(-1)?.portfolioValueChf ?? 0;
  const change = last - first;

  return (
    <section className="panel chart-panel">
      <div className="section-heading chart-heading">
        <div><p>Portfolio value</p><h2>{range === "ALL" ? "All recorded history" : `Performance · ${range}`}</h2></div>
        <div className="range-tabs" aria-label="Chart time range">
          {ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}
        </div>
      </div>
      <div className="chart-delta"><span className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}</span><small>over selected period</small></div>
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
            <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} minTickGap={40} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis hide domain={["dataMin - 500", "dataMax + 400"]} />
            <Tooltip
              contentStyle={{ background: "var(--surface-strong)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)" }}
              formatter={(value) => [formatChf(Number(value)), "Portfolio"]}
              labelStyle={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}
            />
            <Area type="monotone" dataKey="portfolioValueChf" stroke="var(--chart)" strokeWidth={2.5} fill="url(#portfolioFill)" activeDot={{ r: 4, fill: "var(--chart)", strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">Snapshot history is fictional seed data in Milestone 1. Contribution-adjusted return calculations arrive in Milestone 5.</p>
    </section>
  );
}
