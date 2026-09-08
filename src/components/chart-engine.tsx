"use client";

import { useEffect, useRef } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AreaSeries, ColorType, CrosshairMode, LineSeries, LineStyle, PriceScaleMode, createChart, createSeriesMarkers, type IChartApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { indexChartPoints, type ChartPoint } from "@/lib/portfolio/chart-data";

export type ChartScaleMode = "linear" | "log";

export interface TimeSeriesChartSeries {
  id: string;
  label: string;
  color: string;
  data: ChartPoint[];
  type?: "area" | "line";
  areaTopColor?: string;
  markers?: SeriesMarker<UTCTimestamp>[];
}

interface TimeSeriesChartProps {
  series: TimeSeriesChartSeries[];
  daily: boolean;
  scaleMode?: ChartScaleMode;
  showZeroLine?: boolean;
  title?: string;
  valueFormatter: (value: number) => string;
  ariaLabel: string;
}

const dateFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * The shared interactive time-series renderer. Keep chart-library setup here so
 * new line, area, return, and risk charts only need to describe their series.
 */
export function TimeSeriesChart({ series, daily, scaleMode = "linear", showZeroLine = false, title, valueFormatter, ariaLabel }: TimeSeriesChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLOutputElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
      rightPriceScale: { borderColor: color("--line"), minimumWidth: 84, mode: scaleMode === "log" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal, scaleMargins: { top: 0.16, bottom: 0.12 } },
      timeScale: { borderColor: color("--line"), timeVisible: !daily, secondsVisible: false, rightOffset: 2, minBarSpacing: 0.01 },
      localization: {
        locale: "en-CH",
        priceFormatter: valueFormatter,
        timeFormatter: (time: number) => (daily ? dateFormat : timeFormat).format(new Date(time * 1000)),
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });
    const renderedSeries = series.map((definition, index) => {
      const points = indexChartPoints(definition.data, daily);
      const type = definition.type ?? (index === 0 ? "area" : "line");
      const options = {
        color: definition.color,
        lineWidth: 2 as const,
        title: definition.label,
        priceLineVisible: type === "area",
        priceLineStyle: LineStyle.Dashed,
        priceLineColor: definition.color,
        crosshairMarkerRadius: 3,
        priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 },
      };
      const chartSeries = type === "area"
        ? chart.addSeries(AreaSeries, { ...options, lineColor: definition.color, topColor: definition.areaTopColor ?? "rgba(63, 155, 106, 0.16)", bottomColor: "rgba(63, 155, 106, 0)" })
        : chart.addSeries(LineSeries, options);
      chartSeries.setData([...points].map(([time, point]) => ({ time: time as UTCTimestamp, value: point.displayValue })));
      if (definition.markers?.length) createSeriesMarkers(chartSeries, definition.markers, { zOrder: "aboveSeries" });
      return { chartSeries, points };
    });
    if (showZeroLine && renderedSeries[0]) {
      renderedSeries[0].chartSeries.createPriceLine({ price: 0, color: color("--line-strong"), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    }
    chart.timeScale().fitContent();
    chartRef.current = chart;
    const primary = series[0];
    const primaryPoints = renderedSeries[0]?.points ?? new Map<number, ChartPoint>();
    const showPoint = (point: ChartPoint | undefined) => {
      if (!readout.current || !point) return;
      readout.current.textContent = `${(daily ? dateFormat : timeFormat).format(new Date(point.time))}${daily ? "" : " UTC"}   ·   ${valueFormatter(point.displayValue)}`;
    };
    showPoint(primary?.data.at(-1));
    chart.subscribeCrosshairMove((event) => showPoint(event.time === undefined ? primary?.data.at(-1) : primaryPoints.get(Number(event.time)) ?? primary?.data.at(-1)));
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: color("--surface-strong") }, textColor: color("--muted") }, grid: { vertLines: { color: color("--line") }, horzLines: { color: color("--line") } } });
    theme.addEventListener("change", updateTheme);
    return () => {
      theme.removeEventListener("change", updateTheme);
      chart.remove();
      chartRef.current = null;
    };
  }, [ariaLabel, daily, scaleMode, series, showZeroLine, valueFormatter]);

  const zoom = (factor: number) => {
    const scale = chartRef.current?.timeScale();
    const visible = scale?.getVisibleLogicalRange();
    if (!scale || !visible) return;
    const center = (visible.from + visible.to) / 2;
    const half = Math.max(2, (visible.to - visible.from) * factor / 2);
    scale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  return <div className="trading-plot">
    <div className="trading-readout">{title ? <span>{title}</span> : null}{series.filter((_, index) => !title || index > 0).map((item) => <span className="overlay-key" key={item.id}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}<output ref={readout} aria-live="off" /></div>
    <div ref={container} className="trading-canvas" role="img" aria-label={ariaLabel} />
    <div className="trading-navigation" aria-label="Chart navigation">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.5)}><Minus /></button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.65)}><Plus /></button>
      <button type="button" aria-label="Reset chart view" title="Fit selected period" onClick={() => { chartRef.current?.priceScale("right").applyOptions({ autoScale: true }); chartRef.current?.timeScale().fitContent(); }}><RotateCcw /></button>
    </div>
  </div>;
}

export interface DonutChartItem { name: string; value: number; }

interface DonutChartProps {
  data: DonutChartItem[];
  colors: string[];
  valueFormatter: (value: number) => string;
}

/** Shared categorical chart renderer for allocation-style visualizations. */
export function DonutChart({ data, colors, valueFormatter }: DonutChartProps) {
  return <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={74} stroke="var(--surface-strong)" strokeWidth={3}>
        {data.map((item, index) => <Cell fill={colors[index % colors.length]} key={item.name} />)}
      </Pie>
      <Tooltip formatter={(value) => valueFormatter(Number(value))} contentStyle={{ background: "var(--surface-strong)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)" }} />
    </PieChart>
  </ResponsiveContainer>;
}
