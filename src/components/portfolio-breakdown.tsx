"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardData } from "@/lib/portfolio/service";
import { formatChf, formatPercent, toneForValue } from "@/lib/format";

type Position = DashboardData["positions"][number];
type Summary = DashboardData["summary"];
type AccountCash = DashboardData["accountCash"];
type Dimension = "holding" | "asset" | "region" | "currency" | "broker";
type Metric = "value" | "cost" | "pnl" | "today" | "income" | "fees";
type SortKey = "name" | "value" | "cost" | "pnl" | "return" | "today" | "income" | "fees" | "weight";

const colors = ["#3f9b6a", "#70957f", "#d7a957", "#5f7da5", "#a36e83", "#8d7f6b", "#87b4a0", "#c37f62"];
const metricLabels: Record<Metric, string> = {
  value: "Market value",
  cost: "Cost basis",
  pnl: "Total P&L",
  today: "Today’s P&L",
  income: "Dividends",
  fees: "Fees",
};

function metricValue(position: Position, metric: Metric) {
  if (metric === "value") return position.marketValueChf ?? 0;
  if (metric === "cost") return position.costBasisChf;
  if (metric === "pnl") return position.totalPnlChf ?? 0;
  if (metric === "today") return position.todayPnlChf ?? 0;
  if (metric === "income") return position.dividendIncomeChf;
  return position.feesChf;
}

function accountMetricValue(position: Position, account: Position["accountPositions"][number], metric: Metric) {
  if (metric === "value") return position.currentPriceChf === null ? 0 : account.quantity * position.currentPriceChf;
  if (metric === "cost") return account.costBasisChf;
  if (metric === "pnl") {
    const unrealized = position.currentPriceChf === null ? 0 : account.quantity * position.currentPriceChf - account.costBasisChf;
    return unrealized + account.realizedPnlChf;
  }
  if (metric === "today") return position.quantity > 0 ? (position.todayPnlChf ?? 0) * account.quantity / position.quantity : 0;
  if (metric === "income") return account.dividendIncomeChf;
  return account.feesChf;
}

function allocationRows(positions: Position[], accountCash: AccountCash, dimension: Dimension, metric: Metric) {
  const grouped = new Map<string, number>();
  for (const position of positions) {
    const value = metricValue(position, metric);
    if (dimension === "holding") grouped.set(position.security.name, value);
    if (dimension === "asset") {
      const label = position.security.assetType === "ETF" ? "ETFs" : position.security.assetType === "STOCK" ? "Stocks" : "Other";
      grouped.set(label, (grouped.get(label) ?? 0) + value);
    }
    if (dimension === "currency") grouped.set(position.security.tradingCurrency, (grouped.get(position.security.tradingCurrency) ?? 0) + value);
    if (dimension === "region") {
      const exposureTotal = position.regionalExposures.reduce((total, exposure) => total + exposure.weight, 0);
      const scale = exposureTotal > 100 ? 100 / exposureTotal : 1;
      for (const exposure of position.regionalExposures) {
        grouped.set(exposure.region, (grouped.get(exposure.region) ?? 0) + value * exposure.weight * scale / 100);
      }
      const unclassifiedWeight = Math.max(0, 100 - exposureTotal * scale);
      if (unclassifiedWeight > 0.005) grouped.set("Unclassified", (grouped.get("Unclassified") ?? 0) + value * unclassifiedWeight / 100);
    }
    if (dimension === "broker") {
      for (const account of position.accountPositions) {
        grouped.set(account.brokerName, (grouped.get(account.brokerName) ?? 0) + accountMetricValue(position, account, metric));
      }
    }
  }
  if (metric === "value") {
    if (dimension === "holding" || dimension === "asset" || dimension === "region") grouped.set("Cash", accountCash.reduce((total, account) => total + account.valueChf, 0));
    if (dimension === "broker") for (const account of accountCash) grouped.set(account.brokerName, (grouped.get(account.brokerName) ?? 0) + account.valueChf);
  }
  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => Math.abs(item.value) > 0.005)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function DetailValue({ value, percent = false }: { value: number | null; percent?: boolean }) {
  if (value === null) return <span className="muted">—</span>;
  return <span className={toneForValue(value)}>{percent ? formatPercent(value, { signed: true }) : formatChf(value, { signed: true })}</span>;
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown aria-hidden="true" />;
  return direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />;
}

export function PortfolioBreakdown({ accountCash, positions, summary }: { accountCash: AccountCash; positions: Position[]; summary: Summary }) {
  const [dimension, setDimension] = useState<Dimension>("holding");
  const [metric, setMetric] = useState<Metric>("value");
  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "value", direction: "desc" });

  const rows = useMemo(() => allocationRows(positions, accountCash, dimension, metric), [positions, accountCash, dimension, metric]);
  const magnitudeTotal = rows.reduce((total, row) => total + Math.abs(row.value), 0);
  const marketRows = useMemo(() => positions
    .map((position) => ({ position, value: position.marketValueChf ?? 0 }))
    .sort((left, right) => right.value - left.value), [positions]);
  const topThreeWeight = marketRows.slice(0, 3).reduce((total, row) => total + (row.position.portfolioWeight ?? 0), 0);
  const effectiveHoldings = (() => {
    const squaredWeights = positions.reduce((total, position) => total + Math.pow((position.portfolioWeight ?? 0) / 100, 2), 0);
    return squaredWeights === 0 ? 0 : 1 / squaredWeights;
  })();
  const dataCoverage = positions.length === 0 ? 100 : (positions.filter((position) => position.marketValueChf !== null).length / positions.length) * 100;
  const bestContributor = [...positions].sort((left, right) => (right.totalPnlChf ?? -Infinity) - (left.totalPnlChf ?? -Infinity))[0];
  const worstContributor = [...positions].sort((left, right) => (left.totalPnlChf ?? Infinity) - (right.totalPnlChf ?? Infinity))[0];
  const currencies = [...new Set(positions.map((position) => position.security.tradingCurrency))].sort();
  const assets = [...new Set(positions.map((position) => position.security.assetType))].sort();

  const filteredPositions = useMemo(() => positions
    .filter((position) => assetFilter === "all" || position.security.assetType === assetFilter)
    .filter((position) => currencyFilter === "all" || position.security.tradingCurrency === currencyFilter)
    .filter((position) => `${position.security.name} ${position.security.ticker} ${position.brokerLabel}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => {
      const text = (position: Position) => position.security.name.toLowerCase();
      const numeric: Record<Exclude<SortKey, "name">, (position: Position) => number> = {
        value: (position) => position.marketValueChf ?? -Infinity,
        cost: (position) => position.costBasisChf,
        pnl: (position) => position.totalPnlChf ?? -Infinity,
        return: (position) => position.returnPercent ?? -Infinity,
        today: (position) => position.todayPnlChf ?? -Infinity,
        income: (position) => position.dividendIncomeChf,
        fees: (position) => position.feesChf,
        weight: (position) => position.portfolioWeight ?? -Infinity,
      };
      const comparison = sort.key === "name"
        ? text(left).localeCompare(text(right))
        : numeric[sort.key](left) - numeric[sort.key](right);
      return sort.direction === "asc" ? comparison : -comparison;
    }), [assetFilter, currencyFilter, positions, query, sort]);

  function changeSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" ? "asc" : "desc" });
  }

  return (
    <>
      <section className="breakdown-hero">
        <div>
          <p>Portfolio intelligence</p>
          <h2>See what you own, where it sits, and what drives the result.</h2>
          <span>Every view uses current CHF values and your stored average-cost accounting.</span>
        </div>
        <div className="breakdown-hero-value"><span>Portfolio value</span><strong>{formatChf(summary.portfolioValueChf)}</strong><small>{positions.length} open securities · {currencies.length} trading currencies</small></div>
      </section>

      <section className="breakdown-kpis" aria-label="Diversification overview">
        <div><span><Layers3 aria-hidden="true" />Largest position</span><strong>{marketRows[0]?.position.security.ticker ?? "—"}</strong><small>{formatPercent(marketRows[0]?.position.portfolioWeight ?? 0)} of portfolio</small></div>
        <div><span><ShieldCheck aria-hidden="true" />Top 3 concentration</span><strong>{formatPercent(topThreeWeight)}</strong><small>{topThreeWeight > 60 ? "Concentrated" : "Broadly distributed"}</small></div>
        <div><span><Sparkles aria-hidden="true" />Effective holdings</span><strong>{effectiveHoldings.toFixed(1)}</strong><small>Concentration-adjusted count</small></div>
        <div><span><CircleDollarSign aria-hidden="true" />Cash allocation</span><strong>{formatPercent(summary.portfolioValueChf === 0 ? 0 : (summary.cashChf / summary.portfolioValueChf) * 100)}</strong><small>{formatChf(summary.cashChf)} available</small></div>
        <div><span><ChartNoAxesColumnIncreasing aria-hidden="true" />Price coverage</span><strong>{formatPercent(dataCoverage)}</strong><small>{dataCoverage === 100 ? "All holdings priced" : "Some values unavailable"}</small></div>
      </section>

      <section className="panel breakdown-explorer">
        <div className="breakdown-explorer-head">
          <div className="section-heading"><div><p>Allocation explorer</p><h2>Slice the portfolio your way</h2></div></div>
          <div className="breakdown-controls">
            <div className="breakdown-segment" role="tablist" aria-label="Breakdown dimension">
              {(["holding", "asset", "region", "currency", "broker"] as const).map((item) => <button aria-selected={dimension === item} className={dimension === item ? "is-active" : ""} key={item} onClick={() => setDimension(item)} role="tab" type="button">{item === "asset" ? "Asset type" : item[0].toUpperCase() + item.slice(1)}</button>)}
            </div>
            <label className="breakdown-select"><span>Measure</span><select aria-label="Breakdown measure" onChange={(event) => setMetric(event.target.value as Metric)} value={metric}>{(Object.keys(metricLabels) as Metric[]).map((item) => <option key={item} value={item}>{metricLabels[item]}</option>)}</select></label>
          </div>
        </div>
        <div className="breakdown-explorer-body">
          <div className="breakdown-donut">
            <ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={rows.map((row) => ({ ...row, chartValue: Math.abs(row.value) }))} dataKey="chartValue" nameKey="name" innerRadius="64%" outerRadius="88%" paddingAngle={2} stroke="none">{rows.map((row, index) => <Cell fill={colors[index % colors.length]} key={row.name} />)}</Pie><Tooltip formatter={(_value, _name, item) => formatChf(item.payload.value, { signed: metric === "pnl" || metric === "today" })} contentStyle={{ background: "var(--surface-strong)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)", fontSize: 10 }} /></PieChart></ResponsiveContainer>
            <div><strong>{rows.length}</strong><span>{dimension === "holding" ? "positions" : "groups"}</span></div>
          </div>
          <div className="breakdown-ranking">
            <div className="breakdown-ranking-head"><span>{metricLabels[metric]} by {dimension}</span><strong>{formatChf(rows.reduce((total, row) => total + row.value, 0), { signed: metric === "pnl" || metric === "today" })}</strong></div>
            {rows.map((row, index) => <div className="breakdown-rank" key={row.name}><div><i style={{ background: colors[index % colors.length] }} /><span>{row.name}</span><strong className={metric === "pnl" || metric === "today" ? toneForValue(row.value) : ""}>{formatChf(row.value, { signed: metric === "pnl" || metric === "today" })}</strong></div><div className="breakdown-bar"><i style={{ background: colors[index % colors.length], width: `${magnitudeTotal === 0 ? 0 : (Math.abs(row.value) / magnitudeTotal) * 100}%` }} /></div><small>{formatPercent(magnitudeTotal === 0 ? 0 : (Math.abs(row.value) / magnitudeTotal) * 100)} of {metric === "pnl" || metric === "today" ? "absolute result" : "total"}</small></div>)}
            {rows.length === 0 ? <p className="breakdown-empty">No non-zero values for this measure yet.</p> : null}
          </div>
        </div>
      </section>

      <section className="breakdown-insights">
        <div className="panel contribution-panel">
          <div className="section-heading"><div><p>Result drivers</p><h2>Total P&amp;L contributors</h2></div><span>Realized + unrealized</span></div>
          <div className="contribution-list">{[...positions].sort((left, right) => Math.abs(right.totalPnlChf ?? 0) - Math.abs(left.totalPnlChf ?? 0)).map((position) => {
            const value = position.totalPnlChf ?? 0;
            const max = Math.max(...positions.map((item) => Math.abs(item.totalPnlChf ?? 0)), 1);
            return <Link href={`/holdings/${position.securityId}`} key={position.securityId}><span><strong>{position.security.ticker}</strong><small>{position.security.name}</small></span><div className={`contribution-track ${value < 0 ? "is-negative" : ""}`}><i style={{ width: `${(Math.abs(value) / max) * 100}%` }} /></div><strong className={toneForValue(value)}>{formatChf(value, { signed: true })}</strong></Link>;
          })}</div>
        </div>
        <div className="panel insight-panel">
          <div className="section-heading"><div><p>At a glance</p><h2>Portfolio signals</h2></div></div>
          <div className="signal-list">
            <div><span>Best contributor</span><strong>{bestContributor?.security.ticker ?? "—"}</strong><small>{bestContributor?.totalPnlChf == null ? "No result" : formatChf(bestContributor.totalPnlChf, { signed: true })}</small></div>
            <div><span>Largest detractor</span><strong>{worstContributor?.security.ticker ?? "—"}</strong><small>{worstContributor?.totalPnlChf == null ? "No result" : formatChf(worstContributor.totalPnlChf, { signed: true })}</small></div>
            <div><span>Dividend income</span><strong>{formatChf(positions.reduce((total, position) => total + position.dividendIncomeChf, 0))}</strong><small>Net security income</small></div>
            <div><span>Recorded fees</span><strong>{formatChf(positions.reduce((total, position) => total + position.feesChf, 0))}</strong><small>Holding-level fees</small></div>
          </div>
        </div>
      </section>

      <section className="panel breakdown-table-panel">
        <div className="section-heading table-heading"><div><p>Position anatomy</p><h2>Every holding, fully explained</h2></div><span>{filteredPositions.length} of {positions.length} securities</span></div>
        <div className="breakdown-filters">
          <label className="breakdown-search"><Search aria-hidden="true" /><span className="sr-only">Search positions</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search security, ticker, or broker" type="search" value={query} /></label>
          <select aria-label="Filter by asset type" onChange={(event) => setAssetFilter(event.target.value)} value={assetFilter}><option value="all">All asset types</option>{assets.map((asset) => <option key={asset} value={asset}>{asset}</option>)}</select>
          <select aria-label="Filter by currency" onChange={(event) => setCurrencyFilter(event.target.value)} value={currencyFilter}><option value="all">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select>
        </div>
        <div className="table-scroll">
          <table className="data-table breakdown-table">
            <thead><tr>{([
              ["name", "Security"], ["value", "Market value"], ["cost", "Cost basis"], ["pnl", "Total P&L"], ["return", "Return"], ["today", "Today"], ["income", "Dividends"], ["fees", "Fees"], ["weight", "Weight"],
            ] as [SortKey, string][]).map(([key, label]) => <th aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={key === "name" ? "" : "numeric"} key={key}><button onClick={() => changeSort(key)} type="button">{label}<SortIcon active={sort.key === key} direction={sort.direction} /></button></th>)}</tr></thead>
            <tbody>{filteredPositions.map((position) => <tr key={position.securityId}><td className="security-cell"><Link href={`/holdings/${position.securityId}`}><span className="security-icon">{position.security.ticker.slice(0, 2)}</span><span><strong>{position.security.name}</strong><small>{position.security.ticker} · {position.security.assetType} · {position.security.tradingCurrency}<br />{position.brokerLabel}</small></span></Link></td><td className="numeric mono strong">{position.marketValueChf === null ? "—" : formatChf(position.marketValueChf)}</td><td className="numeric mono">{formatChf(position.costBasisChf)}</td><td className="numeric mono"><DetailValue value={position.totalPnlChf} /></td><td className="numeric mono"><DetailValue percent value={position.returnPercent} /></td><td className="numeric mono"><DetailValue value={position.todayPnlChf} /></td><td className="numeric mono">{formatChf(position.dividendIncomeChf)}</td><td className="numeric mono">{formatChf(position.feesChf)}</td><td className="numeric mono">{position.portfolioWeight === null ? "—" : formatPercent(position.portfolioWeight)}</td></tr>)}</tbody>
          </table>
          {filteredPositions.length === 0 ? <div className="breakdown-empty">No positions match these filters.</div> : null}
        </div>
      </section>
    </>
  );
}
