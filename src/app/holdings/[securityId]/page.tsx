import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, History, LineChart } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatChf, formatCurrency, formatDate, formatNumber, formatPercent, toneForValue } from "@/lib/format";
import { getDashboardData, getPositionDetail } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ securityId: string }> }): Promise<Metadata> {
  const { securityId } = await params;
  const detail = await getPositionDetail(securityId);
  if (!detail) return { title: "Holding not found — Stance" };
  return { title: `${detail.position.security.name} — Stance`, description: `Portfolio position for ${detail.position.security.ticker}.` };
}

export default async function HoldingDetailPage({ params }: { params: Promise<{ securityId: string }> }) {
  const { securityId } = await params;
  const [detail, dashboard] = await Promise.all([getPositionDetail(securityId), getDashboardData()]);
  if (!detail) notFound();
  const { position, transactions } = detail;

  return (
    <AppShell active="Holdings" eyebrow="Security position" issueCount={dashboard.issues.length} title={position.security.ticker}>
      <div className="breadcrumb"><Link href="/">Overview</Link><ChevronRight aria-hidden="true" /><Link href="/#holdings">Holdings</Link><ChevronRight aria-hidden="true" /><strong>{position.security.ticker}</strong></div>
      <section className="page-card">
        <div className="detail-hero">
          <div className="detail-identity"><span className="security-icon">{position.security.ticker.slice(0, 2)}</span><div><h2>{position.security.name}</h2><p>{position.security.ticker} · {position.security.exchange ?? "Unknown exchange"} · {position.security.tradingCurrency}</p></div></div>
          <div className="detail-price"><strong>{position.currentPrice === null ? "—" : formatCurrency(position.currentPrice, position.quote?.currency ?? position.security.tradingCurrency)}</strong><small>{position.quote ? `${position.quote.provider === "YAHOO" ? "Yahoo Finance" : position.quote.provider} quote · ${formatDate(position.quote.quotedAt)}` : "Missing market price"}</small></div>
        </div>
        <div className="detail-stats">
          <div><span>Total quantity</span><strong>{formatNumber(position.quantity)}</strong></div>
          <div><span>Average cost</span><strong>{formatCurrency(position.averageCostLocal, position.security.tradingCurrency)}</strong></div>
          <div><span>Market value</span><strong>{position.marketValueChf === null ? "—" : formatChf(position.marketValueChf)}</strong></div>
          <div><span>Unrealized P&amp;L</span><strong className={toneForValue(position.unrealizedPnlChf)}>{position.unrealizedPnlChf === null ? "—" : formatChf(position.unrealizedPnlChf, { signed: true })}</strong></div>
          <div><span>Realized P&amp;L</span><strong className={toneForValue(position.realizedPnlChf)}>{formatChf(position.realizedPnlChf, { signed: true })}</strong></div>
          <div><span>Total return</span><strong className={toneForValue(position.returnPercent)}>{position.returnPercent === null ? "—" : formatPercent(position.returnPercent, { signed: true })}</strong></div>
        </div>
      </section>

      <div className="detail-grid">
        <section className="page-card">
          <div className="section-heading"><div><p>Security details</p><h2>Identification &amp; pricing</h2></div></div>
          <dl className="metadata-list">
            <div><dt>ISIN</dt><dd>{position.security.isin ?? "Missing"}</dd></div>
            <div><dt>Asset type</dt><dd>{position.security.assetType}</dd></div>
            <div><dt>Exchange</dt><dd>{position.security.exchange ?? "Missing"}</dd></div>
            <div><dt>Trading currency</dt><dd>{position.security.tradingCurrency}</dd></div>
            <div><dt>Market-data ticker</dt><dd>{position.security.marketDataTicker ?? "Missing"}</dd></div>
            <div><dt>Provider</dt><dd>{position.security.marketDataProvider}</dd></div>
            <div><dt>Portfolio weight</dt><dd>{position.portfolioWeight === null ? "—" : formatPercent(position.portfolioWeight)}</dd></div>
            <div><dt>Current FX rate</dt><dd>{position.quote ? `1 ${position.quote.currency} = ${formatNumber(position.quote.fxRateToChf, 4)} CHF` : "—"}</dd></div>
          </dl>
        </section>
        <section className="page-card">
          <div className="section-heading"><div><p>Broker breakdown</p><h2>{`${position.accountPositions.length} ${position.accountPositions.length === 1 ? "account" : "accounts"}`}</h2></div></div>
          <div className="broker-breakdown">
            {position.accountPositions.map((accountPosition) => <div className="broker-position" key={accountPosition.brokerAccountId}><strong>{accountPosition.brokerName}</strong><span>{accountPosition.accountName}</span><span className="mono">{formatNumber(accountPosition.quantity)} shares</span></div>)}
          </div>
        </section>
      </div>

      <section className="page-card">
        <div className="section-heading"><div><p>Performance</p><h2>Price history</h2></div></div>
        <div className="empty-mini"><LineChart aria-hidden="true" /><div><strong>Historical prices are not connected yet</strong><p>Milestone 2 will add replaceable market-data providers. Milestone 5 will combine those prices with portfolio snapshots.</p></div></div>
      </section>

      <section className="panel holdings-panel">
        <div className="section-heading table-heading"><div><p>Activity</p><h2>Transactions</h2></div><History aria-hidden="true" /></div>
        <div className="table-scroll"><table className="data-table transaction-table"><thead><tr><th>Date</th><th>Type</th><th>Broker</th><th className="numeric">Quantity</th><th className="numeric">Price</th><th className="numeric">Gross value</th><th className="numeric">CHF value</th><th>Notes</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{formatDate(transaction.timestamp)}</td><td><span className="transaction-type"><i className={`type-dot ${transaction.type.toLowerCase()}`} />{transaction.type}</span></td><td>{transaction.brokerName}</td><td className="numeric mono">{transaction.quantity === null ? "—" : formatNumber(transaction.quantity)}</td><td className="numeric mono">{transaction.executionPrice === null ? "—" : formatCurrency(transaction.executionPrice, transaction.transactionCurrency)}</td><td className="numeric mono">{formatCurrency(transaction.totalValue, transaction.transactionCurrency)}</td><td className="numeric mono">{formatChf(transaction.totalValueChf)}</td><td className="muted">{transaction.notes ?? "—"}</td></tr>)}</tbody></table></div>
      </section>
    </AppShell>
  );
}
