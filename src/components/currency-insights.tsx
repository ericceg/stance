"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, Landmark } from "lucide-react";
import { TimeSeriesChart, type TimeSeriesChartSeries } from "@/components/chart-engine";
import { formatChf, formatPercent } from "@/lib/format";
import type { ChartPoint } from "@/lib/portfolio/chart-data";

type Insight = {
  exposure: Array<{ currency: string; marketValueChf: number; fxImpactChf: number }>;
  history: Array<{ currency: string; timestamp: string; rateToChf: number }>;
  totalForeignExposureChf: number;
  totalFxImpactChf: number;
  portfolioValueChf: number;
};

const colors = ["#4385f5", "#e08b3e", "#a66de0", "#18a6a6", "#d85c78"];

export function CurrencyInsights({ insight }: { insight: Insight }) {
  const [selected, setSelected] = useState<string[]>(insight.exposure.filter((item) => item.currency !== "CHF").map((item) => item.currency));
  const chartSeries = useMemo<TimeSeriesChartSeries[]>(() => selected.map((currency, index) => {
    const points = insight.history.filter((point) => point.currency === currency);
    const first = points[0]?.rateToChf ?? 1;
    const data: ChartPoint[] = points.map((point) => ({ timestamp: point.timestamp, time: Date.parse(point.timestamp), displayValue: ((point.rateToChf / first) - 1) * 100, totalPnlChf: 0, portfolioValueChf: 0, isLive: false, source: "HISTORICAL_CLOSE" }));
    return { id: currency, label: currency, color: colors[index % colors.length], data, type: "line" as const };
  }).filter((series) => series.data.length > 1), [insight.history, selected]);
  const foreignExposureShare = insight.portfolioValueChf === 0 ? 0 : insight.totalForeignExposureChf / insight.portfolioValueChf * 100;

  return <>
    <section className="currency-hero">
      <div><p>Currency lens</p><h2>See what your foreign-currency exposure is doing.</h2><span>Reference rates are shown against CHF; security-price changes are kept separate from the FX estimate.</span></div>
      <div className="currency-hero-value"><span>Estimated FX effect</span><strong className={insight.totalFxImpactChf >= 0 ? "positive" : "negative"}>{formatChf(insight.totalFxImpactChf, { signed: true })}</strong><small>Across currently held foreign listings</small></div>
    </section>
    <section className="currency-kpis">
      <div><span><Landmark aria-hidden="true" />Foreign exposure</span><strong>{formatChf(insight.totalForeignExposureChf)}</strong><small>{formatPercent(foreignExposureShare)} of priced holdings</small></div>
      <div><span>{insight.totalFxImpactChf >= 0 ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}FX since average entry</span><strong className={insight.totalFxImpactChf >= 0 ? "positive" : "negative"}>{formatChf(insight.totalFxImpactChf, { signed: true })}</strong><small>Holding today’s local prices constant</small></div>
      <div><span>Tracked currencies</span><strong>{insight.exposure.length}</strong><small>{selected.length} foreign currencies charted</small></div>
    </section>
    <section className="panel currency-chart-panel">
      <div className="section-heading"><div><p>Reference rate history</p><h2>Currency movement vs CHF</h2></div><span>Indexed to 0% at your first foreign-currency transaction</span></div>
      <div className="currency-tabs" aria-label="Currencies shown in chart">{insight.exposure.filter((item) => item.currency !== "CHF").map((item) => <button aria-pressed={selected.includes(item.currency)} key={item.currency} onClick={() => setSelected((current) => current.includes(item.currency) ? current.filter((currency) => currency !== item.currency) : [...current, item.currency])} type="button">{item.currency}</button>)}</div>
      {chartSeries.length > 0 ? <TimeSeriesChart ariaLabel="Foreign currency reference-rate changes against the Swiss franc" daily series={chartSeries} showZeroLine title="Change vs CHF" valueFormatter={(value) => formatPercent(value, { signed: true })} /> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div><strong>Reference-rate history unavailable</strong><p>Rates will appear here once a foreign-currency holding and historical reference rates are available.</p></div></div>}
    </section>
    <section className="panel currency-table-panel"><div className="section-heading"><div><p>Current sensitivity</p><h2>What each currency contributes</h2></div><span>FX effect excludes the investment’s local-price movement</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Currency</th><th className="numeric">Exposure</th><th className="numeric">Portfolio share</th><th className="numeric">FX effect</th></tr></thead><tbody>{insight.exposure.map((item) => <tr key={item.currency}><td><strong>{item.currency}</strong><br /><small className="muted">{item.currency === "CHF" ? "CHF holdings and cash" : `Foreign-currency listings`}</small></td><td className="numeric mono">{formatChf(item.marketValueChf)}</td><td className="numeric mono">{formatPercent(insight.portfolioValueChf === 0 ? 0 : item.marketValueChf / insight.portfolioValueChf * 100)}</td><td className={`numeric mono ${item.fxImpactChf >= 0 ? "positive" : "negative"}`}>{item.currency === "CHF" ? "—" : formatChf(item.fxImpactChf, { signed: true })}</td></tr>)}</tbody></table></div></section>
    <p className="currency-method">Method: for each open foreign-currency position, Stance compares today’s CHF value with the value that the same local market value would have had at your remaining position’s average entry FX rate. This is an estimate, not total return or a forecast.</p>
  </>;
}
