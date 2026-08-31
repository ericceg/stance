"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { DashboardData } from "@/lib/portfolio/service";
import { formatChf, formatCurrency, formatNumber, formatPercent, toneForValue } from "@/lib/format";

type Position = DashboardData["positions"][number];
type SortKey = "name" | "ticker" | "broker" | "quantity" | "averageCost" | "currentPrice" | "marketValue" | "todayPnl" | "totalPnl" | "returnPercent" | "weight";

const numericValues: Record<Exclude<SortKey, "name" | "ticker" | "broker">, (position: Position) => number | null> = {
  quantity: (position) => position.quantity,
  averageCost: (position) => position.averageCostLocal,
  currentPrice: (position) => position.currentPrice,
  marketValue: (position) => position.marketValueChf,
  todayPnl: (position) => position.todayPnlChf,
  totalPnl: (position) => position.totalPnlChf,
  returnPercent: (position) => position.returnPercent,
  weight: (position) => position.portfolioWeight,
};

function sortValue(position: Position, key: SortKey) {
  if (key === "name") return position.security.name.toLowerCase();
  if (key === "ticker") return position.security.ticker.toLowerCase();
  if (key === "broker") return position.brokerLabel.toLowerCase();
  return numericValues[key](position) ?? -Infinity;
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown aria-hidden="true" />;
  return direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />;
}

function PnlValue({ value, percent = false }: { value: number | null; percent?: boolean }) {
  if (value === null) return <span className="muted">—</span>;
  return <span className={toneForValue(value)}>{percent ? formatPercent(value, { signed: true }) : formatChf(value, { signed: true })}</span>;
}

export function HoldingsTable({ positions }: { positions: Position[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "marketValue", direction: "desc" });
  const sortedPositions = useMemo(() => [...positions].sort((left, right) => {
    const leftValue = sortValue(left, sort.key);
    const rightValue = sortValue(right, sort.key);
    const comparison = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [positions, sort]);

  function changeSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" || key === "ticker" || key === "broker" ? "asc" : "desc" });
  }

  const headers: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "name", label: "Security" },
    { key: "ticker", label: "Ticker" },
    { key: "broker", label: "Broker" },
    { key: "quantity", label: "Quantity", align: "right" },
    { key: "averageCost", label: "Average cost", align: "right" },
    { key: "currentPrice", label: "Current price", align: "right" },
    { key: "marketValue", label: "Market value CHF", align: "right" },
    { key: "todayPnl", label: "Today’s P&L", align: "right" },
    { key: "totalPnl", label: "Total P&L", align: "right" },
    { key: "returnPercent", label: "Return", align: "right" },
    { key: "weight", label: "Weight", align: "right" },
  ];

  return (
    <section className="panel holdings-panel" id="holdings">
      <div className="section-heading table-heading"><div><p>Holdings</p><h2>Current positions</h2></div><span>{positions.length} securities</span></div>
      <div className="table-scroll">
        <table className="data-table holdings-table">
          <thead><tr>{headers.map((header) => <th aria-sort={sort.key === header.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={header.align === "right" ? "numeric" : ""} key={header.key}><button onClick={() => changeSort(header.key)} type="button">{header.label}<SortIcon active={sort.key === header.key} direction={sort.direction} /></button></th>)}</tr></thead>
          <tbody>
            {sortedPositions.map((position) => (
              <tr key={position.securityId}>
                <td className="security-cell"><Link href={`/holdings/${position.securityId}`}><span className="security-icon">{position.security.ticker.slice(0, 2)}</span><span><strong>{position.security.name}</strong><small>{position.security.assetType} · {position.security.exchange ?? "Exchange unknown"}</small></span></Link></td>
                <td><span className="ticker-chip">{position.security.ticker}</span></td>
                <td className="broker-cell">{position.brokerLabel}</td>
                <td className="numeric mono">{formatNumber(position.quantity)}</td>
                <td className="numeric mono">{formatCurrency(position.averageCostLocal, position.security.tradingCurrency)}</td>
                <td className="numeric mono">{position.currentPrice === null ? "—" : formatCurrency(position.currentPrice, position.security.tradingCurrency)}</td>
                <td className="numeric mono strong">{position.marketValueChf === null ? "—" : formatChf(position.marketValueChf)}</td>
                <td className="numeric mono"><PnlValue value={position.todayPnlChf} /></td>
                <td className="numeric mono"><PnlValue value={position.totalPnlChf} /></td>
                <td className="numeric mono"><PnlValue percent value={position.returnPercent} /></td>
                <td className="numeric mono">{position.portfolioWeight === null ? "—" : formatPercent(position.portfolioWeight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
