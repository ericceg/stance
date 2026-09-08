import Link from "next/link";
import { CircleCheck, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClearTransactionsButton } from "@/components/clear-transactions-button";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";
import { formatChf, formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { loadPortfolio } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const [data, query] = await Promise.all([loadPortfolio(), searchParams]);
  const accountById = new Map(data.brokerAccounts.map((account) => [account.id, account]));
  const securityById = new Map(data.securities.map((security) => [security.id, security]));
  const transactions = [...data.transactions].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

  return (
    <AppShell active="Transactions" eyebrow="Portfolio ledger" issueCount={data.summary.issues.length} title="Transactions">
      {query.created === "1" ? <div className="quality-banner"><CircleCheck aria-hidden="true" /><span>Transaction saved and portfolio positions recalculated.</span></div> : null}
      <section className="panel holdings-panel">
        <div className="section-heading table-heading">
          <div><p>Ledger</p><h2>All transactions</h2></div>
          <div className="flex items-center gap-2">
            {transactions.length > 0 ? <ClearTransactionsButton count={transactions.length} /> : null}
            <Link className="secondary-button" href="/transactions/new"><Plus aria-hidden="true" />Add transaction</Link>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table transaction-table">
            <thead><tr><th>Date</th><th>Type</th><th>Security</th><th>Broker</th><th className="numeric">Quantity</th><th className="numeric">Price</th><th className="numeric">Gross value</th><th className="numeric">CHF value</th><th>Source</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {transactions.length === 0 ? <tr><td colSpan={10} className="empty-table">No transactions yet. <Link href="/transactions/new">Add a transaction</Link> or <Link href="/import">import a broker statement</Link> to get started.</td></tr> : null}
              {transactions.map((transaction) => {
                const security = transaction.securityId ? securityById.get(transaction.securityId) : null;
                const account = accountById.get(transaction.brokerAccountId);
                return (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.timestamp)}</td>
                    <td><span className="transaction-type"><i className={`type-dot ${transaction.type.toLowerCase()}`} />{transaction.type[0] + transaction.type.slice(1).toLowerCase()}</span></td>
                    <td>{security ? <Link href={`/holdings/${security.id}`}><strong>{security.name}</strong><br /><small className="muted">{security.ticker}</small></Link> : <span className="muted">Cash</span>}</td>
                    <td>{account?.brokerName ?? "Unknown"}</td>
                    <td className="numeric mono">{transaction.quantity ? formatNumber(transaction.quantity.toNumber()) : "—"}</td>
                    <td className="numeric mono">{transaction.executionPrice ? formatCurrency(transaction.executionPrice.toNumber(), transaction.transactionCurrency) : "—"}</td>
                    <td className="numeric mono">{formatCurrency(transaction.totalValue.toNumber(), transaction.transactionCurrency)}</td>
                    <td className="numeric mono">{formatChf(transaction.totalValueChf.toNumber())}</td>
                    <td><span className="type-chip">{transaction.importSource}</span></td>
                    <td><div className="row-actions"><DeleteTransactionButton id={transaction.id} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
