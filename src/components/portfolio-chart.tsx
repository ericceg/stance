"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Activity, ChartNoAxesCombined } from "lucide-react";
import { type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { TimeSeriesChart, type ChartScaleMode, type TimeSeriesChartSeries } from "@/components/chart-engine";
import { formatChf, formatPercent } from "@/lib/format";
import { readIncludeClosedChartPositions, subscribeToChartPreferences } from "@/lib/preferences";
import { aggregateChartSeries, chartRanges as ranges, chartResolutions as resolutions, drawdownChartSeries, prepareChartData, indexChartPoints, rebaseChartSeries, type ChartRange as Range, type ChartResolution as Resolution, type ChartPoint, type ChartSnapshot } from "@/lib/portfolio/chart-data";

// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
type Metric = "pnl" | "value" | "drawdown";
type ComparisonMode = "individual" | "aggregate";
type BaselineMode = "level" | "change";
type ScaleMode = ChartScaleMode;
interface SecurityChartSeries {
  securityId: string;
  ticker: string;
  name: string;
  isClosed: boolean;
  snapshots: ChartSnapshot[];
}
interface PortfolioChartProps {
  chartTransactions: ChartTransaction[];
  hasTransactions: boolean;
  recordedSnapshotCount: number;
  snapshots: ChartSnapshot[];
  securitySeries: SecurityChartSeries[];
}

interface ChartTransaction {
  id: string;
  securityId: string;
  type: "BUY" | "SELL";
  timestamp: string;
}

interface OverlaySeries {
  id: string;
  label: string;
  color: string;
  data: ChartPoint[];
  securityIds: string[];
}

const overlayColors = ["#4385f5", "#e08b3e", "#a66de0", "#d85c78", "#18a6a6", "#8d9b3f"];

function tradeMarkers(data: ChartPoint[], transactions: ChartTransaction[], daily: boolean): SeriesMarker<UTCTimestamp>[] {
  const times = [...indexChartPoints(data, daily).keys()];
  if (times.length === 0) return [];
  return transactions.flatMap((transaction) => {
    const parsedTime = Date.parse(transaction.timestamp);
    if (!Number.isFinite(parsedTime)) return [];
    const requestedTime = daily ? Math.floor(parsedTime / 86_400_000) * 86_400 : Math.floor(parsedTime / 1_000);
    if (requestedTime < times[0] || requestedTime > times.at(-1)!) return [];
    const markerTime = times.reduce((nearest, time) => Math.abs(time - requestedTime) < Math.abs(nearest - requestedTime) ? time : nearest, times[0]);
    const buy = transaction.type === "BUY";
    return [{
      id: transaction.id,
      time: markerTime as UTCTimestamp,
      position: buy ? "belowBar" as const : "aboveBar" as const,
      shape: "circle" as const,
      color: buy ? "#2f9d68" : "#d65c5c",
      text: buy ? "▲" : "▼",
      size: 0,
    }];
  }).sort((left, right) => Number(left.time) - Number(right.time));
}

export function PortfolioChart({ chartTransactions, hasTransactions, recordedSnapshotCount, snapshots, securitySeries }: PortfolioChartProps) {
  const [range, setRange] = useState<Range>("1M");
  const [metric, setMetric] = useState<Metric>("pnl");
  const [area, setArea] = useState(true);
  const [resolution, setResolution] = useState<Resolution>("auto");
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showTrades, setShowTrades] = useState(false);
  const [selectedSecurityIds, setSelectedSecurityIds] = useState<string[]>([]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("individual");
  const [baselineMode, setBaselineMode] = useState<BaselineMode>("level");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const includeClosedPositions = useSyncExternalStore(
    subscribeToChartPreferences,
    readIncludeClosedChartPositions,
    () => false,
  );
  const availableSecuritySeries = useMemo(
    () => securitySeries.filter((series) => includeClosedPositions || !series.isClosed),
    [includeClosedPositions, securitySeries],
  );
  const availableSecurityIds = useMemo(() => new Set(availableSecuritySeries.map((series) => series.securityId)), [availableSecuritySeries]);
  const visibleSelectedSecurityIds = useMemo(() => selectedSecurityIds.filter((securityId) => availableSecurityIds.has(securityId)), [availableSecurityIds, selectedSecurityIds]);
  const sourceMetric = metric === "drawdown" ? "value" : metric;
  const portfolioPrepared = useMemo(
    () => prepareChartData(snapshots, range, sourceMetric, resolution), [snapshots, range, sourceMetric, resolution],
  );
  const { displayPoint, daily, resolution: selectedResolution } = portfolioPrepared;
  const data = useMemo(() => metric === "drawdown" ? drawdownChartSeries(portfolioPrepared.fullData) : portfolioPrepared.fullData, [metric, portfolioPrepared.fullData]);
  const resolutionLabel = selectedResolution[0].toUpperCase() + selectedResolution.slice(1);
  const selectedSeries = useMemo(() => availableSecuritySeries.filter((series) => visibleSelectedSecurityIds.includes(series.securityId)).map((series, index) => ({
    ...series,
    color: overlayColors[index % overlayColors.length],
    data: prepareChartData(series.snapshots, range, sourceMetric, resolution).fullData,
  })), [availableSecuritySeries, visibleSelectedSecurityIds, range, sourceMetric, resolution]);
  const plottableSeries = useMemo(() => selectedSeries.filter((series) => series.data.length >= 2), [selectedSeries]);
  const selectedAggregateData = useMemo(() => {
    const aggregated = aggregateChartSeries(plottableSeries.map((series) => series.data));
    return metric === "drawdown" ? drawdownChartSeries(aggregated) : aggregated;
  }, [metric, plottableSeries]);
  const overlays = useMemo<OverlaySeries[]>(() => {
    if (comparisonMode === "aggregate" && plottableSeries.length > 0) {
      return [{ id: "selected-total", label: `Selected (${plottableSeries.length})`, color: overlayColors[0], data: selectedAggregateData, securityIds: plottableSeries.map((series) => series.securityId) }];
    }
    return plottableSeries.map((series) => ({ id: series.securityId, label: series.ticker, color: series.color, data: metric === "drawdown" ? drawdownChartSeries(series.data) : series.data, securityIds: [series.securityId] }));
  }, [comparisonMode, metric, plottableSeries, selectedAggregateData]);
  const canRebase = metric !== "drawdown";
  const plottedData = useMemo(() => canRebase && baselineMode === "change" ? rebaseChartSeries(data) : data, [baselineMode, canRebase, data]);
  const plottedOverlays = useMemo(() => baselineMode === "change"
    && canRebase ? overlays.map((overlay) => ({ ...overlay, data: rebaseChartSeries(overlay.data) }))
    : overlays, [baselineMode, canRebase, overlays]);
  const hasMissingSelectedHistory = selectedSeries.some((series) => series.data.length < 2);
  const allSecuritiesSelected = availableSecuritySeries.length > 0 && visibleSelectedSecurityIds.length === availableSecuritySeries.length;
  const liveEstimate = displayPoint?.source === "LIVE_ESTIMATE" ? displayPoint.displayValue : null;
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;
  const summaryData = showPortfolio ? data : selectedAggregateData;
  const chartValue = summaryData.at(-1)?.displayValue ?? 0;
  const firstValue = summaryData.at(0)?.displayValue ?? 0;
  const change = metric === "drawdown" ? chartValue : chartValue - firstValue;
  const low = summaryData.reduce((value, point) => Math.min(value, point.displayValue), chartValue);
  const high = summaryData.reduce((value, point) => Math.max(value, point.displayValue), chartValue);
  const hasVisibleTrend = (showPortfolio && hasTrend) || overlays.some((overlay) => overlay.data.length >= 2);
  const chartSeries = useMemo<TimeSeriesChartSeries[]>(() => {
    const primary = showPortfolio ? [{
      id: "portfolio",
      label: metric === "drawdown" ? "Portfolio drawdown" : metric === "pnl" ? "Portfolio P&L" : "Portfolio value",
      color: metric === "drawdown" ? "#d65c5c" : "#3f9b6a",
      data: plottedData,
      type: area ? "area" as const : "line" as const,
      areaTopColor: metric === "drawdown" ? "rgba(214, 92, 92, 0.16)" : undefined,
      markers: showTrades && plottedOverlays.length === 0 ? tradeMarkers(plottedData, chartTransactions, daily) : undefined,
    }] : [];
    return [...primary, ...plottedOverlays.map((overlay) => ({
      ...overlay,
      type: "line" as const,
      markers: showTrades ? tradeMarkers(overlay.data, chartTransactions.filter((transaction) => overlay.securityIds.includes(transaction.securityId)), daily) : undefined,
    }))];
  }, [area, chartTransactions, daily, metric, plottedData, plottedOverlays, showPortfolio, showTrades]);
  const valueFormatter = useMemo(() => metric === "drawdown"
    ? (value: number) => formatPercent(value)
    : (value: number) => formatChf(value, { signed: metric === "pnl" || baselineMode === "change" }).replace("CHF ", ""), [baselineMode, metric]);

  return <section className="panel terminal-chart-panel trading-panel">
    <header className="trading-toolbar">
      <div className="terminal-kicker"><Activity aria-hidden="true" /> Performance <span className="trading-currency">CHF</span></div>
      <div className="trading-toolbar-controls">
        <div className="metric-tabs" aria-label="Chart metric">
          <button aria-pressed={metric === "pnl"} className={metric === "pnl" ? "is-active" : ""} onClick={() => setMetric("pnl")} type="button">P&amp;L</button>
          <button aria-pressed={metric === "value"} className={metric === "value" ? "is-active" : ""} onClick={() => setMetric("value")} type="button">Value</button>
          <button aria-pressed={metric === "drawdown"} className={metric === "drawdown" ? "is-active" : ""} onClick={() => { setMetric("drawdown"); setBaselineMode("level"); setScaleMode("linear"); }} type="button">Drawdown</button>
        </div>
      </div>
    </header>
    <details className="disclosure chart-options"><summary>Chart options <span>Compare holdings, intervals &amp; display</span></summary><div className="chart-options-body">
        <div className="trading-style" aria-label="Chart style">
          <button type="button" aria-pressed={!area} onClick={() => setArea(false)}>Line</button>
          <button type="button" aria-pressed={area} onClick={() => setArea(true)}>Area</button>
        </div>
        <div className="interval-tabs" aria-label="Chart interval">
          {resolutions.map((item) => <button key={item} type="button" aria-pressed={resolution === item} onClick={() => setResolution(item)}>{item === "minute" ? "Min" : item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
      </div>
    {availableSecuritySeries.length > 0 ? <div className="comparison-toolbar">
      <button className="portfolio-toggle" type="button" aria-pressed={showPortfolio} onClick={() => setShowPortfolio((current) => !current)}>Portfolio</button>
      <span>Holdings</span>
      <div className="holding-tabs" aria-label="Holdings shown on chart">
        <button type="button" aria-pressed={visibleSelectedSecurityIds.length === 0} onClick={() => setSelectedSecurityIds([])}>None</button>
        <button type="button" aria-pressed={allSecuritiesSelected} onClick={() => setSelectedSecurityIds(availableSecuritySeries.map((series) => series.securityId))}>All</button>
        {availableSecuritySeries.map((series) => <button className={series.isClosed ? "is-closed" : ""} key={series.securityId} title={`${series.name}${series.isClosed ? " (closed)" : ""}`} type="button" aria-pressed={visibleSelectedSecurityIds.includes(series.securityId)} onClick={() => setSelectedSecurityIds((current) => current.includes(series.securityId) ? current.filter((id) => id !== series.securityId) : [...current, series.securityId])}>{series.ticker}{series.isClosed ? <small>Closed</small> : null}</button>)}
      </div>
      <div className="comparison-mode" aria-label="Holding chart mode">
        <button type="button" aria-pressed={comparisonMode === "individual"} onClick={() => setComparisonMode("individual")}>Separate</button>
        <button type="button" aria-pressed={comparisonMode === "aggregate"} onClick={() => setComparisonMode("aggregate")}>Combined</button>
      </div>
      <div className="comparison-basis" aria-label="Chart baseline">
        <button type="button" disabled={metric === "drawdown"} aria-pressed={baselineMode === "level"} onClick={() => setBaselineMode("level")}>Level</button>
        <button type="button" disabled={metric === "drawdown"} aria-pressed={baselineMode === "change"} title="Start every line at CHF 0 for the selected period" onClick={() => setBaselineMode("change")}>Change</button>
      </div>
      <div className="scale-mode" aria-label="Chart scale">
        <button type="button" disabled={metric === "drawdown"} aria-pressed={scaleMode === "linear"} onClick={() => setScaleMode("linear")}>Linear</button>
        <button type="button" disabled={metric === "drawdown"} aria-pressed={scaleMode === "log"} title="Compress large magnitudes while retaining zero and negative values" onClick={() => setScaleMode("log")}>Log</button>
      </div>
      <button className="trade-toggle" type="button" aria-pressed={showTrades} onClick={() => setShowTrades((current) => !current)}>Buy/Sell</button>
    </div> : null}</details>
    <div className="trading-summary">
      <div className="terminal-value-row"><strong>{metric === "drawdown" ? formatPercent(chartValue) : formatChf(chartValue, { signed: metric === "pnl" })}</strong><span className={metric === "drawdown" ? "negative" : change >= 0 ? "positive" : "negative"}>{metric === "drawdown" ? "From peak" : formatChf(change, { signed: true })}<small>{range}</small></span></div>
      <div className="trading-extremes">{metric === "drawdown" ? <><span>Peak <strong>{formatPercent(high)}</strong></span><span>Max drawdown <strong>{formatPercent(low)}</strong></span></> : <><span>{daily ? `${resolutionLabel} high` : "High"} <strong>{formatChf(high)}</strong></span><span>{daily ? `${resolutionLabel} low` : "Low"} <strong>{formatChf(low)}</strong></span></>}</div>
    </div>
    {hasVisibleTrend ? <TimeSeriesChart series={chartSeries} daily={daily} scaleMode={metric === "drawdown" ? "linear" : scaleMode} showZeroLine={metric === "drawdown" || baselineMode === "change"} title={showPortfolio ? `${metric === "drawdown" ? "Portfolio drawdown" : metric === "pnl" ? "Portfolio P&L" : "Portfolio value"}${baselineMode === "change" && metric !== "drawdown" ? " change" : ""}${scaleMode === "log" && metric !== "drawdown" ? " · Log scale" : ""}` : undefined} valueFormatter={valueFormatter} ariaLabel={`${daily ? "Daily" : "Intraday"} ${metric === "drawdown" ? "drawdown percentage" : metric === "pnl" ? "profit and loss" : "value"} chart for ${showPortfolio ? "the portfolio" : "selected holdings"}. Drag to pan and scroll to zoom.`} /> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div><strong>{!showPortfolio && visibleSelectedSecurityIds.length === 0 ? "No chart series selected" : !showPortfolio ? "Holding history unavailable" : hasTransactions ? "More history needed for this range" : "No portfolio history yet"}</strong><p>{!showPortfolio ? "Enable Portfolio or select holdings with available history." : hasTransactions ? "Choose a longer range or refresh prices to add a valuation." : "Add or import a transaction to start tracking performance."}</p></div></div>}
    <div className="trading-bottom-bar">
      <div className="range-tabs" aria-label="Chart time range">{ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} aria-pressed={item === range} onClick={() => setRange(item)} type="button">{item}</button>)}</div>
      <span>{resolutionLabel} intervals · UTC<span className="trading-gesture-hint"> · Drag to pan · Scroll to zoom</span></span>
    </div>
    <footer className="trading-note"><span>{metric === "drawdown" ? "Percentage below the highest portfolio value reached within this range" : baselineMode === "change" ? "Each line starts at CHF 0 at its first valuation in this range" : selectedResolution === "intraday" ? "Intraday detail available for the latest 7 days" : `Last available valuation each ${selectedResolution}`}{scaleMode === "log" && metric !== "drawdown" ? " · Symmetric log scale compresses large moves while retaining zero and losses" : ""}</span>{showTrades ? <span className="trade-key"><i className="buy-marker" /> Buy <i className="sell-marker" /> Sell</span> : null}{hasMissingSelectedHistory ? <span>Some holding history needs a history rebuild</span> : null}{liveEstimate !== null ? <span>Live estimate <strong>{formatChf(liveEstimate, { signed: metric === "pnl" })}</strong> · excluded from chart</span> : null}</footer>
  </section>;
}
