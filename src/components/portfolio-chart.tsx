"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChartNoAxesCombined, Minus, Plus, RotateCcw } from "lucide-react";
import { AreaSeries, ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { formatChf } from "@/lib/format";
import { chartRanges as ranges, chartResolutions as resolutions, prepareChartData, indexChartPoints, type ChartRange as Range, type ChartResolution as Resolution, type ChartPoint, type ChartSnapshot } from "@/lib/portfolio/chart-data";

// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
type Metric = "pnl" | "value";
interface PortfolioChartProps {
  hasTransactions: boolean;
  recordedSnapshotCount: number;
  snapshots: ChartSnapshot[];
}

const dateFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function TradingPlot({ data, daily, metric, area }: { data: ChartPoint[]; daily: boolean; metric: Metric; area: boolean }) {
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
    const series = chart.addSeries(AreaSeries, {
      lineColor: color("--chart"), lineWidth: 2,
      topColor: "rgba(63, 155, 106, 0.16)", bottomColor: "rgba(63, 155, 106, 0)",
      priceLineStyle: LineStyle.Dashed, priceLineColor: color("--chart"),
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    // The canvas engine supports full intraday history; deduplicate to its second precision.
    const points = indexChartPoints(data, daily);
    series.setData([...points].map(([time, point]) => ({ time: time as UTCTimestamp, value: point.displayValue })));
    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;
    const showPoint = (point: ChartPoint | undefined) => {
      if (!readout.current || !point) return;
      readout.current.textContent = `${(daily ? dateFormat : timeFormat).format(new Date(point.time))}${daily ? "" : " UTC"}   ·   ${formatChf(point.displayValue, { signed: metric === "pnl" })}`;
    };
    showPoint(data.at(-1));
    chart.subscribeCrosshairMove((event) => {
      showPoint(event.time === undefined ? data.at(-1) : points.get(Number(event.time)) ?? data.at(-1));
    });
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: color("--surface-strong") }, textColor: color("--muted") }, grid: { vertLines: { color: color("--line") }, horzLines: { color: color("--line") } } });
      series.applyOptions({ lineColor: color("--chart"), priceLineColor: color("--chart") });
    };
    theme.addEventListener("change", updateTheme);
    return () => {
      theme.removeEventListener("change", updateTheme);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, daily, metric]);

  useEffect(() => {
    seriesRef.current?.applyOptions({ topColor: area ? "rgba(63, 155, 106, 0.16)" : "transparent", bottomColor: "rgba(63, 155, 106, 0)" });
  }, [area, data, daily, metric]);

  const zoom = (factor: number) => {
    const scale = chartRef.current?.timeScale();
    const visible = scale?.getVisibleLogicalRange();
    if (!scale || !visible) return;
    const center = (visible.from + visible.to) / 2;
    const half = Math.max(2, (visible.to - visible.from) * factor / 2);
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  return <div className="trading-plot">
    <div className="trading-readout"><span>{metric === "pnl" ? "Portfolio P&L" : "Portfolio value"} · CHF</span><output ref={readout} aria-live="off" /></div>
    <div ref={container} className="trading-canvas" role="img" aria-label={`${daily ? "Daily" : "Intraday"} ${metric === "pnl" ? "profit and loss" : "portfolio value"} chart. Drag to pan, scroll to zoom. Values are shown above the chart.`} />
    <div className="trading-navigation" aria-label="Chart navigation">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.5)}><Minus /></button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.65)}><Plus /></button>
      <button type="button" aria-label="Reset chart view" title="Fit selected period" onClick={() => { chartRef.current?.priceScale("right").applyOptions({ autoScale: true }); chartRef.current?.timeScale().fitContent(); }}><RotateCcw /></button>
    </div>
  </div>;
}

export function PortfolioChart({ hasTransactions, recordedSnapshotCount, snapshots }: PortfolioChartProps) {
  const [range, setRange] = useState<Range>("1M");
  const [metric, setMetric] = useState<Metric>("pnl");
  const [area, setArea] = useState(true);
  const [resolution, setResolution] = useState<Resolution>("auto");
  const { fullData: data, displayPoint, chartValue, change, low, high, daily, resolution: selectedResolution } = useMemo(
    () => prepareChartData(snapshots, range, metric, resolution), [snapshots, range, metric, resolution],
  );
  const resolutionLabel = selectedResolution[0].toUpperCase() + selectedResolution.slice(1);
  const liveEstimate = displayPoint?.source === "LIVE_ESTIMATE" ? displayPoint.displayValue : null;
  const hasTrend = data.length >= 2 && recordedSnapshotCount >= 2;

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
    <div className="trading-summary">
      <div className="terminal-value-row"><strong>{formatChf(chartValue, { signed: metric === "pnl" })}</strong><span className={change >= 0 ? "positive" : "negative"}>{formatChf(change, { signed: true })}<small>{range}</small></span></div>
      <div className="trading-extremes"><span>{daily ? `${resolutionLabel} high` : "High"} <strong>{formatChf(high)}</strong></span><span>{daily ? `${resolutionLabel} low` : "Low"} <strong>{formatChf(low)}</strong></span></div>
    </div>
    {hasTrend ? <TradingPlot data={data} daily={daily} metric={metric} area={area} /> : <div className="empty-mini chart-empty"><ChartNoAxesCombined aria-hidden="true" /><div><strong>{hasTransactions ? "More history needed for this range" : "No portfolio history yet"}</strong><p>{hasTransactions ? "Choose a longer range or refresh prices to add a valuation." : "Add or import a transaction to start tracking performance."}</p></div></div>}
    <div className="trading-bottom-bar">
      <div className="range-tabs" aria-label="Chart time range">{ranges.map((item) => <button className={item === range ? "is-active" : ""} key={item} aria-pressed={item === range} onClick={() => setRange(item)} type="button">{item}</button>)}</div>
      <span>{resolutionLabel} intervals · UTC<span className="trading-gesture-hint"> · Drag to pan · Scroll to zoom</span></span>
    </div>
    <footer className="trading-note"><span>{selectedResolution === "intraday" ? "Intraday detail available for the latest 7 days" : `Last available valuation each ${selectedResolution}`}</span>{liveEstimate !== null ? <span>Live estimate <strong>{formatChf(liveEstimate, { signed: metric === "pnl" })}</strong> · excluded from chart</span> : null}</footer>
  </section>;
}
