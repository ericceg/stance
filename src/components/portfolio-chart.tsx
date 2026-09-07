"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChartNoAxesCombined, Minus, Plus, RotateCcw } from "lucide-react";
import { AreaSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { formatChf } from "@/lib/format";
import { aggregateChartSeries, chartRanges as ranges, chartResolutions as resolutions, prepareChartData, indexChartPoints, type ChartRange as Range, type ChartResolution as Resolution, type ChartPoint, type ChartSnapshot } from "@/lib/portfolio/chart-data";

// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
type Metric = "pnl" | "value";
type ComparisonMode = "individual" | "aggregate";
interface SecurityChartSeries {
  securityId: string;
  ticker: string;
  name: string;
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

const dateFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

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

function TradingPlot({ data, daily, metric, area, overlays, showPortfolio, showTrades, transactions }: { data: ChartPoint[]; daily: boolean; metric: Metric; area: boolean; overlays: OverlaySeries[]; showPortfolio: boolean; showTrades: boolean; transactions: ChartTransaction[] }) {
  const container = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLOutputElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    const styles = getComputedStyle(host);
    const color = (name: string) => styles.getPropertyValue(name).trim();
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: color("--surface-strong") }, textColor: color("--muted"), fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: color("--line") }, horzLines: { color: color("--line") } },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: color("--muted"), width: 1, style: LineStyle.Dashed, labelBackgroundColor: color("--ink-soft") },
        horzLine: { color: color("--muted"), width: 1, style: LineStyle.Dashed, labelBackgroundColor: color("--ink-soft") },
      },
      rightPriceScale: { borderColor: color("--line"), minimumWidth: 84, scaleMargins: { top: 0.16, bottom: 0.12 } },
      timeScale: { borderColor: color("--line"), timeVisible: !daily, secondsVisible: false, rightOffset: 2, minBarSpacing: 0.01 },
      localization: {
        locale: "en-CH",
        priceFormatter: (value: number) => formatChf(value).replace("CHF ", ""),
        timeFormatter: (time: number) => (daily ? dateFormat : timeFormat).format(new Date(time * 1000)),
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });
    // The canvas engine supports full intraday history; deduplicate to its second precision.
    const points = indexChartPoints(data, daily);
    let series: ISeriesApi<"Area"> | null = null;
    if (showPortfolio) {
      series = chart.addSeries(AreaSeries, {
        lineColor: color("--chart"), lineWidth: 2,
        topColor: "rgba(63, 155, 106, 0.16)", bottomColor: "rgba(63, 155, 106, 0)",
        priceLineStyle: LineStyle.Dashed, priceLineColor: color("--chart"),
        crosshairMarkerRadius: 4,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      series.setData([...points].map(([time, point]) => ({ time: time as UTCTimestamp, value: point.displayValue })));
      if (showTrades && overlays.length === 0) createSeriesMarkers(series, tradeMarkers(data, transactions, daily), { zOrder: "aboveSeries" });
    }
    for (const overlay of overlays) {
      const overlaySeries = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 2,
        title: overlay.label,
        priceLineVisible: false,
        crosshairMarkerRadius: 3,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      const overlayPoints = indexChartPoints(overlay.data, daily);
      overlaySeries.setData([...overlayPoints].map(([time, point]) => ({ time: time as UTCTimestamp, value: point.displayValue })));
      if (showTrades) createSeriesMarkers(overlaySeries, tradeMarkers(overlay.data, transactions.filter((transaction) => overlay.securityIds.includes(transaction.securityId)), daily), { zOrder: "aboveSeries" });
    }
    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;
    const primaryData = showPortfolio ? data : overlays[0]?.data ?? [];
    const primaryPoints = showPortfolio ? points : indexChartPoints(primaryData, daily);
    const showPoint = (point: ChartPoint | undefined) => {
      if (!readout.current || !point) return;
      readout.current.textContent = `${(daily ? dateFormat : timeFormat).format(new Date(point.time))}${daily ? "" : " UTC"}   ·   ${formatChf(point.displayValue, { signed: metric === "pnl" })}`;
    };
    showPoint(primaryData.at(-1));
    chart.subscribeCrosshairMove((event) => {
      showPoint(event.time === undefined ? primaryData.at(-1) : primaryPoints.get(Number(event.time)) ?? primaryData.at(-1));
    });
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: color("--surface-strong") }, textColor: color("--muted") }, grid: { vertLines: { color: color("--line") }, horzLines: { color: color("--line") } } });
      series?.applyOptions({ lineColor: color("--chart"), priceLineColor: color("--chart") });
    };
    theme.addEventListener("change", updateTheme);
    return () => {
      theme.removeEventListener("change", updateTheme);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, daily, metric, overlays, showPortfolio, showTrades, transactions]);

  useEffect(() => {
    seriesRef.current?.applyOptions({ topColor: area ? "rgba(63, 155, 106, 0.16)" : "transparent", bottomColor: "rgba(63, 155, 106, 0)" });
  }, [area, data, daily, metric, overlays, showPortfolio, showTrades, transactions]);

  const zoom = (factor: number) => {
    const scale = chartRef.current?.timeScale();
    const visible = scale?.getVisibleLogicalRange();
    if (!scale || !visible) return;
    const center = (visible.from + visible.to) / 2;
    const half = Math.max(2, (visible.to - visible.from) * factor / 2);
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  return <div className="trading-plot">
    <div className="trading-readout">{showPortfolio ? <span>{metric === "pnl" ? "Portfolio P&L" : "Portfolio value"} · CHF</span> : null}{overlays.map((overlay) => <span className="overlay-key" key={overlay.id}><i style={{ backgroundColor: overlay.color }} />{overlay.label}</span>)}<output ref={readout} aria-live="off" /></div>
    <div ref={container} className="trading-canvas" role="img" aria-label={`${daily ? "Daily" : "Intraday"} ${metric === "pnl" ? "profit and loss" : "value"} chart for ${showPortfolio ? "the portfolio" : "selected holdings"}. Drag to pan, scroll to zoom. Values are shown above the chart.`} />
    <div className="trading-navigation" aria-label="Chart navigation">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.5)}><Minus /></button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.65)}><Plus /></button>
      <button type="button" aria-label="Reset chart view" title="Fit selected period" onClick={() => { chartRef.current?.priceScale("right").applyOptions({ autoScale: true }); chartRef.current?.timeScale().fitContent(); }}><RotateCcw /></button>
    </div>
  </div>;
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
  const { fullData: data, displayPoint, chartValue: portfolioChartValue, change: portfolioChange, low: portfolioLow, high: portfolioHigh, daily, resolution: selectedResolution } = useMemo(
    () => prepareChartData(snapshots, range, metric, resolution), [snapshots, range, metric, resolution],
  );
  const resolutionLabel = selectedResolution[0].toUpperCase() + selectedResolution.slice(1);
  const selectedSeries = useMemo(() => securitySeries.filter((series) => selectedSecurityIds.includes(series.securityId)).map((series, index) => ({
    ...series,
    color: overlayColors[index % overlayColors.length],
    data: prepareChartData(series.snapshots, range, metric, resolution).fullData,
  })), [securitySeries, selectedSecurityIds, range, metric, resolution]);
  const plottableSeries = useMemo(() => selectedSeries.filter((series) => series.data.length >= 2), [selectedSeries]);
  const selectedAggregateData = useMemo(() => aggregateChartSeries(plottableSeries.map((series) => series.data)), [plottableSeries]);
  const overlays = useMemo<OverlaySeries[]>(() => {
    if (comparisonMode === "aggregate" && plottableSeries.length > 0) {
      return [{ id: "selected-total", label: `Selected (${plottableSeries.length})`, color: overlayColors[0], data: selectedAggregateData, securityIds: plottableSeries.map((series) => series.securityId) }];
    }
    return plottableSeries.map((series) => ({ id: series.securityId, label: series.ticker, color: series.color, data: series.data, securityIds: [series.securityId] }));
  }, [comparisonMode, plottableSeries, selectedAggregateData]);
  const hasMissingSelectedHistory = selectedSeries.some((series) => series.data.length < 2);
  const allSecuritiesSelected = securitySeries.length > 0 && selectedSecurityIds.length === securitySeries.length;
  const liveEstimate = displayPoint?.source === "LIVE_ESTIMATE" ? displayPoint.displayValue : null;
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;
  const selectedFirst = selectedAggregateData.at(0)?.displayValue ?? 0;
  const selectedLast = selectedAggregateData.at(-1)?.displayValue ?? 0;
  const chartValue = showPortfolio ? portfolioChartValue : selectedLast;
  const change = showPortfolio ? portfolioChange : selectedLast - selectedFirst;
  const low = showPortfolio ? portfolioLow : selectedAggregateData.reduce((value, point) => Math.min(value, point.displayValue), selectedLast);
  const high = showPortfolio ? portfolioHigh : selectedAggregateData.reduce((value, point) => Math.max(value, point.displayValue), selectedLast);
  const hasVisibleTrend = (showPortfolio && hasTrend) || overlays.some((overlay) => overlay.data.length >= 2);

  return <section className="panel terminal-chart-panel trading-panel">
    <header className="trading-toolbar">
      <div className="terminal-kicker"><Activity aria-hidden="true" /> Performance <span className="trading-currency">CHF</span></div>
      <div className="trading-toolbar-controls">
        <div className="metric-tabs" aria-label="Chart metric">
          <button aria-pressed={metric === "pnl"} className={metric === "pnl" ? "is-active" : ""} onClick={() => setMetric("pnl")} type="button">P&amp;L</button>
          <button aria-pressed={metric === "value"} className={metric === "value" ? "is-active" : ""} onClick={() => setMetric("value")} type="button">Value</button>
        </div>
        <div className="trading-style" aria-label="Chart style">
          <button type="button" aria-pressed={!area} onClick={() => setArea(false)}>Line</button>
          <button type="button" aria-pressed={area} onClick={() => setArea(true)}>Area</button>
        </div>
        <div className="interval-tabs" aria-label="Chart interval">
          {resolutions.map((item) => <button key={item} type="button" aria-pressed={resolution === item} onClick={() => setResolution(item)}>{item === "minute" ? "Min" : item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
      </div>
    </header>
    {securitySeries.length > 0 ? <div className="comparison-toolbar">
      <button className="portfolio-toggle" type="button" aria-pressed={showPortfolio} onClick={() => setShowPortfolio((current) => !current)}>Portfolio</button>
      <span>Holdings</span>
      <div className="holding-tabs" aria-label="Holdings shown on chart">
        <button type="button" aria-pressed={selectedSecurityIds.length === 0} onClick={() => setSelectedSecurityIds([])}>None</button>
        <button type="button" aria-pressed={allSecuritiesSelected} onClick={() => setSelectedSecurityIds(securitySeries.map((series) => series.securityId))}>All</button>
        {securitySeries.map((series) => <button key={series.securityId} title={series.name} type="button" aria-pressed={selectedSecurityIds.includes(series.securityId)} onClick={() => setSelectedSecurityIds((current) => current.includes(series.securityId) ? current.filter((id) => id !== series.securityId) : [...current, series.securityId])}>{series.ticker}</button>)}
      </div>
      <div className="comparison-mode" aria-label="Holding chart mode">
        <button type="button" aria-pressed={comparisonMode === "individual"} onClick={() => setComparisonMode("individual")}>Separate</button>
        <button type="button" aria-pressed={comparisonMode === "aggregate"} onClick={() => setComparisonMode("aggregate")}>Combined</button>
      </div>
      <button className="trade-toggle" type="button" aria-pressed={showTrades} onClick={() => setShowTrades((current) => !current)}>Buy/Sell</button>
    </div> : null}
    <div className="trading-summary">
      <div className="terminal-value-row"><strong>{formatChf(chartValue, { signed: metric === "pnl" })}</strong><span className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}<small>{range}</small></span></div>
      <div className="trading-extremes"><span>{daily ? `${resolutionLabel} high` : "High"} <strong>{formatChf(high)}</strong></span><span>{daily ? `${resolutionLabel} low` : "Low"} <strong>{formatChf(low)}</strong></span></div>
    </div>
    {hasVisibleTrend ? <TradingPlot data={data} daily={daily} metric={metric} area={area} overlays={overlays} showPortfolio={showPortfolio} showTrades={showTrades} transactions={chartTransactions} /> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div><strong>{!showPortfolio && selectedSecurityIds.length === 0 ? "No chart series selected" : !showPortfolio ? "Holding history unavailable" : hasTransactions ? "More history needed for this range" : "No portfolio history yet"}</strong><p>{!showPortfolio ? "Enable Portfolio or select holdings with available history." : hasTransactions ? "Choose a longer range or refresh prices to add a valuation." : "Add or import a transaction to start tracking performance."}</p></div></div>}
    <div className="trading-bottom-bar">
      <div className="range-tabs" aria-label="Chart time range">{ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} aria-pressed={item === range} onClick={() => setRange(item)} type="button">{item}</button>)}</div>
      <span>{resolutionLabel} intervals · UTC<span className="trading-gesture-hint"> · Drag to pan · Scroll to zoom</span></span>
    </div>
    <footer className="trading-note"><span>{selectedResolution === "intraday" ? "Intraday detail available for the latest 7 days" : `Last available valuation each ${selectedResolution}`}</span>{showTrades ? <span className="trade-key"><i className="buy-marker" /> Buy <i className="sell-marker" /> Sell</span> : null}{hasMissingSelectedHistory ? <span>Some holding history needs a history rebuild</span> : null}{liveEstimate !== null ? <span>Live estimate <strong>{formatChf(liveEstimate, { signed: metric === "pnl" })}</strong> · excluded from chart</span> : null}</footer>
  </section>;
}
