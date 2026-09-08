"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatChf, formatPercent } from "@/lib/format";

const colors = ["#4daa78", "#7f8f86", "#d7a957", "#5f7da5", "#a36e83", "#8d7f6b"];

type AllocationData = {
  asset: { name: string; value: number }[];
  currency: { name: string; value: number }[];
  broker: { name: string; value: number }[];
  region: { name: string; value: number }[];
};

export function AllocationChart({ allocation, total }: { allocation: AllocationData; total: number }) {
  const [view, setView] = useState<keyof AllocationData>("asset");
  const data = allocation[view];

  return (
    <section className="panel allocation-panel">
      <div className="section-heading"><div><p>Allocation</p><h2>Portfolio mix</h2></div></div>
      <div className="allocation-tabs" role="tablist" aria-label="Allocation dimension">
        {(["asset", "region", "currency", "broker"] as const).map((item) => <button aria-selected={view === item} className={view === item ? "is-active" : ""} key={item} onClick={() => setView(item)} role="tab" type="button">{item === "asset" ? "Asset type" : item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      <div className="allocation-body">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={74} stroke="var(--surface-strong)" strokeWidth={3}>
                {data.map((item, index) => <Cell fill={colors[index % colors.length]} key={item.name} />)}
              </Pie>
              <Tooltip formatter={(value) => formatChf(Number(value))} contentStyle={{ background: "var(--surface-strong)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-label"><strong>{data.length}</strong><small>groups</small></div>
        </div>
        <div className="allocation-legend">
          {data.map((item, index) => (
            <div key={item.name}><span className="legend-dot" style={{ background: colors[index % colors.length] }} /><span>{item.name}</span><strong>{formatPercent(total === 0 ? 0 : (item.value / total) * 100)}</strong></div>
          ))}
        </div>
      </div>
    </section>
  );
}
