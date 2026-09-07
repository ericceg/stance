import Link from "next/link";
import { ArrowUpRight, CircleCheck, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { AllocationChart } from "@/components/allocation-chart";
import { AppShell } from "@/components/app-shell";
import { HoldingsTable } from "@/components/holdings-table";
import { PortfolioChart } from "@/components/portfolio-chart";
import { formatChf, formatPercent, toneForValue } from "@/lib/format";
import { getDashboardData } from "@/lib/portfolio/service";

// Prisma access is not a Next.js request API, so opt out of build-time prerendering.
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  const updatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
  const today = new Date();
  const quoteIsToday = updatedAt !== null
    && updatedAt.getFullYear() === today.getFullYear()
    && updatedAt.getMonth() === today.getMonth()
    && updatedAt.getDate() === today.getDate();
  const quoteLabel = updatedAt
    ? new Intl.DateTimeFormat("en-CH", quoteIsToday
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(updatedAt)
    : "Unavailable";
  const todayLabel = new Intl.DateTimeFormat("en-CH", { weekday: "long", day: "2-digit", month: "long" }).format(new Date()).toUpperCase();

  return (
    <AppShell active="Overview" eyebrow={todayLabel} issueCount={data.issues.length} title="Portfolio overview">
      {data.issues.length > 0 ? (
        <Link className="issue-banner" href="/data-issues"><TriangleAlert aria-hidden="true" /><span><strong>{data.issues.length} data {data.issues.length === 1 ? "issue needs" : "issues need"} attention</strong><small>Review missing prices, FX rates, or identifiers before relying on totals.</small></span><ArrowUpRight aria-hidden="true" /></Link>
      ) : (
        <div className="quality-banner"><CircleCheck aria-hidden="true" /><span>All positions have a current price, CHF rate, and canonical identifier.</span></div>
      )}

      <section className="overview-grid">
        <div className="total-card">
          <div className="total-card-head">
            <div><p>Total portfolio</p><strong>{formatChf(data.summary.portfolioValueChf)}</strong><span>Holdings + available cash</span></div>
            <div className="quote-status"><RefreshCw aria-hidden="true" /><span>{data.quoteProviderLabel}<small>Updated {quoteLabel}</small></span></div>
          </div>
          <div className="metric-grid">
            <div><span>Today</span><strong className={toneForValue(data.summary.todayPnlChf)}>{formatChf(data.summary.todayPnlChf, { signed: true })}</strong><small className={toneForValue(data.summary.todayReturnPercent)}>{formatPercent(data.summary.todayReturnPercent, { signed: true })}</small></div>
            <div><span>Total P&amp;L</span><strong className={toneForValue(data.summary.totalPnlChf)}>{formatChf(data.summary.totalPnlChf, { signed: true })}</strong><small className={toneForValue(data.summary.totalReturnPercent)}>{formatPercent(data.summary.totalReturnPercent, { signed: true })}</small></div>
            <div><span>Invested</span><strong>{formatChf(data.summary.investedCapitalChf)}</strong><small>Remaining cost basis</small></div>
            <div><span>Cash</span><strong>{formatChf(data.summary.cashChf)}</strong><small>{formatPercent((data.summary.cashChf / data.summary.portfolioValueChf) * 100)} of portfolio</small></div>
          </div>
        </div>
        <AllocationChart allocation={data.allocation} total={data.summary.portfolioValueChf} />
      </section>

      <section className="secondary-metrics" aria-label="Portfolio accounting summary">
        <div><span>Market value</span><strong>{formatChf(data.summary.marketValueChf)}</strong></div>
        <div><span>Net contributions</span><strong>{formatChf(data.summary.netContributionsChf)}</strong></div>
        <div><span>Unrealized P&amp;L</span><strong className={toneForValue(data.summary.unrealizedPnlChf)}>{formatChf(data.summary.unrealizedPnlChf, { signed: true })}</strong></div>
        <div><span>Realized P&amp;L</span><strong className={toneForValue(data.summary.realizedPnlChf)}>{formatChf(data.summary.realizedPnlChf, { signed: true })}</strong></div>
        <div className="method-note"><Clock3 aria-hidden="true" /><span><strong>Average-cost accounting</strong><small>Fees included · CHF conversion stored per transaction</small></span></div>
      </section>

      <PortfolioChart hasTransactions={data.hasTransactions} recordedSnapshotCount={data.recordedSnapshotCount} snapshots={data.snapshots} securitySeries={data.securitySeries} />
      <HoldingsTable positions={data.positions} />
    </AppShell>
  );
}
