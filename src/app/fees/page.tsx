import Link from "next/link";
import { ArrowUpRight, BadgeSwissFranc, CircleGauge, Plus, ReceiptText, Scale, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FeeAmountForm } from "@/components/fee-amount-form";
import { formatChf, formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { buildFeeSummary, feeCategoryLabels, getFeeAmountChf, getFeeCategory } from "@/lib/portfolio/fees";
import { loadPortfolio } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

const categoryDescriptions = {
  TRADING: "Commissions attached to buys and sells",
  INCOME: "Charges deducted from dividends and income",
  ACCOUNT: "Platform, service, and cash-transfer fees",
};

export default async function FeesPage() {
  const data = await loadPortfolio();
  const summary = buildFeeSummary(data.accountingTransactions);
  const accountById = new Map(data.brokerAccounts.map((account) => [account.id, account]));
  const securityById = new Map(data.securities.map((security) => [security.id, security]));
  const feeRows = data.transactions
    .map((transaction) => ({ transaction, amountChf: getFeeAmountChf({ type: transaction.type as "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" | "FEE", feeChf: transaction.feeChf.toNumber(), totalValueChf: transaction.totalValueChf.toNumber() }) }))
    .filter((item) => item.amountChf > 0.000000001)
    .sort((left, right) => right.transaction.timestamp.getTime() - left.transaction.timestamp.getTime());
  const feesByBroker = feeRows.reduce((groups, row) => {
    const account = accountById.get(row.transaction.brokerAccountId);
    const label = account ? `${account.brokerName} · ${account.accountName}` : "Unknown account";
    const current = groups.get(label) ?? { amountChf: 0, count: 0 };
    current.amountChf += row.amountChf;
    current.count += 1;
    groups.set(label, current);
    return groups;
  }, new Map<string, { amountChf: number; count: number }>());
  const brokers = [...feesByBroker.entries()]
    .map(([label, values]) => ({ label, ...values }))
    .sort((left, right) => right.amountChf - left.amountChf);
  const maxMonthlyFee = Math.max(...summary.months.map((month) => month.amountChf), 1);
  const todayLabel = new Intl.DateTimeFormat("en-CH", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());

  return (
    <AppShell active="Fees" eyebrow={todayLabel} issueCount={data.summary.issues.length} title="Fees & costs">
      {feeRows.length === 0 ? (
        <section className="panel empty-state"><ReceiptText aria-hidden="true" /><h2>No fees recorded yet</h2><p>Fees attached to trades, dividends, and standalone account charges appear here automatically.</p><Link className="primary-button" href="/transactions/new?type=FEE"><Plus aria-hidden="true" />Record a fee</Link></section>
      ) : <>
        <section className="fees-overview-grid">
          <div className="fees-hero">
            <div className="fees-hero-icon"><BadgeSwissFranc aria-hidden="true" /></div>
            <div><p>Total recorded costs</p><strong>{formatChf(summary.totalChf)}</strong><span>{summary.entryCount} fee {summary.entryCount === 1 ? "entry" : "entries"} across your complete ledger</span></div>
            <Link className="fees-record-button" href="/transactions/new?type=FEE"><Plus aria-hidden="true" />Record fee</Link>
          </div>
          <div className="panel fees-efficiency-panel">
            <div className="section-heading"><div><p>Cost efficiency</p><h2>What each trade costs</h2></div><CircleGauge aria-hidden="true" /></div>
            <strong>{summary.effectiveTradeFeePercent === null ? "—" : formatPercent(summary.effectiveTradeFeePercent)}</strong>
            <p>{summary.effectiveTradeFeePercent === null ? "Add a buy or sell to calculate your effective trading fee rate." : `${formatChf(summary.tradeFeeChf)} in trade costs on ${formatChf(summary.tradeVolumeChf)} of executed volume.`}</p>
          </div>
        </section>

        <section className="fees-kpis" aria-label="Fee summary">
          <div><span>Last 12 months</span><strong>{formatChf(summary.trailingTwelveMonthsChf)}</strong><small>Rolling cost total</small></div>
          <div><span>Trading fees</span><strong>{formatChf(summary.tradeFeeChf)}</strong><small>Buy and sell commissions</small></div>
          <div><span>Largest category</span><strong>{summary.categories[0] ? feeCategoryLabels[summary.categories[0].category] : "—"}</strong><small>{summary.categories[0] ? formatChf(summary.categories[0].amountChf) : "No cost data"}</small></div>
          <div><span>Average fee event</span><strong>{formatChf(summary.totalChf / summary.entryCount)}</strong><small>Across recorded charges</small></div>
        </section>

        <section className="fees-insights-grid">
          <div className="panel fee-trend-panel">
            <div className="section-heading"><div><p>Cost rhythm</p><h2>Monthly fees</h2></div><span>Last 12 months</span></div>
            <div className="fee-trend-chart" role="img" aria-label="Monthly fees for the last twelve months">
              {summary.months.map((month) => <div className="fee-month" key={month.key}><div className="fee-bar-wrap"><i style={{ height: `${Math.max(month.amountChf > 0 ? 8 : 0, month.amountChf / maxMonthlyFee * 100)}%` }} title={`${month.label}: ${formatChf(month.amountChf)}`} /></div><span>{month.label}</span></div>)}
            </div>
            <div className="fee-trend-footer"><span><i />Monthly recorded costs</span><strong>Peak {formatChf(Math.max(...summary.months.map((month) => month.amountChf)))}</strong></div>
          </div>
          <div className="panel fee-category-panel">
            <div className="section-heading"><div><p>Cost mix</p><h2>Where fees come from</h2></div><Scale aria-hidden="true" /></div>
            <div className="fee-category-list">
              {summary.categories.map((item) => <div key={item.category}><div><strong>{feeCategoryLabels[item.category]}</strong><small>{categoryDescriptions[item.category]} · {item.count} {item.count === 1 ? "entry" : "entries"}</small></div><span><b>{formatChf(item.amountChf)}</b><i><em style={{ width: `${item.amountChf / summary.totalChf * 100}%` }} /></i></span></div>)}
            </div>
          </div>
        </section>

        <section className="fees-insights-grid fees-broker-grid">
          <div className="panel fee-broker-panel">
            <div className="section-heading"><div><p>By broker</p><h2>Cost concentration</h2></div><WalletCards aria-hidden="true" /></div>
            <div className="fee-broker-list">
              {brokers.map((broker) => <div key={broker.label}><div><strong>{broker.label}</strong><small>{broker.count} {broker.count === 1 ? "fee event" : "fee events"}</small></div><span><b>{formatChf(broker.amountChf)}</b><small>{formatPercent(broker.amountChf / summary.totalChf * 100)}</small></span></div>)}
            </div>
          </div>
          <aside className="fee-guidance"><ArrowUpRight aria-hidden="true" /><strong>Read the signal, not just the total</strong><p>Compare trading fees with executed volume to judge pricing. Standalone account fees often deserve a separate broker review because they do not scale with activity.</p></aside>
        </section>

        <section className="panel holdings-panel fee-ledger-panel">
          <div className="section-heading table-heading"><div><p>Fee ledger</p><h2>Every recorded cost</h2></div><span>Adjust a value in its original currency; its historical CHF rate stays fixed.</span></div>
          <div className="table-scroll"><table className="data-table fee-table"><thead><tr><th>Date</th><th>Kind</th><th>Security / detail</th><th>Broker</th><th className="numeric">Recorded charge</th><th className="numeric">CHF cost</th><th>Manage</th></tr></thead><tbody>
            {feeRows.map(({ transaction, amountChf }) => {
              const type = transaction.type as "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" | "FEE";
              const security = transaction.securityId ? securityById.get(transaction.securityId) : null;
              const account = accountById.get(transaction.brokerAccountId);
              const isStandaloneFee = type === "FEE";
              const originalAmount = isStandaloneFee ? transaction.totalValue.toNumber() : transaction.fee.toNumber();
              return <tr key={transaction.id}><td>{formatDate(transaction.timestamp)}</td><td><span className={`fee-kind ${getFeeCategory(type).toLowerCase()}`}>{isStandaloneFee ? "Account fee" : type === "DIVIDEND" ? "Income fee" : `${type[0] + type.slice(1).toLowerCase()} fee`}</span></td><td>{security ? <Link href={`/holdings/${security.id}`}><strong>{security.name}</strong><br /><small className="muted">{security.ticker}</small></Link> : <span><strong>{transaction.notes || "Account-level charge"}</strong><br /><small className="muted">No security attached</small></span>}</td><td>{account ? <><strong>{account.brokerName}</strong><br /><small className="muted">{account.accountName}</small></> : "Unknown"}</td><td className="numeric mono">{formatCurrency(originalAmount, transaction.transactionCurrency)}</td><td className="numeric mono strong">{formatChf(amountChf)}</td><td><FeeAmountForm amount={originalAmount} currency={transaction.transactionCurrency} isStandaloneFee={isStandaloneFee} transactionId={transaction.id} /></td></tr>;
            })}
          </tbody></table></div>
        </section>
      </>}
    </AppShell>
  );
}
