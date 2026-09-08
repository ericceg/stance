import { Calculator, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TransactionForm } from "@/components/transaction-form";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const [accounts, securities, dashboard, query] = await Promise.all([
    prisma.brokerAccount.findMany({ orderBy: { brokerName: "asc" } }),
    prisma.security.findMany({ orderBy: { name: "asc" } }),
    getDashboardData(),
    searchParams,
  ]);
  const initialType = query.type === "FEE" ? "FEE" : "BUY";

  return (
    <AppShell active="Transactions" eyebrow="Manual entry" issueCount={dashboard.issues.length} title="Add transaction">
      <div className="breadcrumb"><a href="/transactions">Transactions</a><span>/</span><strong>New</strong></div>
      <div className="form-layout">
        <section className="page-card">
          <TransactionForm
            accounts={accounts.map((account) => ({ id: account.id, brokerName: account.brokerName, accountName: account.accountName, baseCurrency: account.baseCurrency }))}
            defaultDate={new Date().toISOString().slice(0, 10)}
            initialType={initialType}
            securities={securities.map((security) => ({ id: security.id, name: security.name, ticker: security.ticker, tradingCurrency: security.tradingCurrency }))}
          />
        </section>
        <aside className="form-note">
          <div className="note-block"><Calculator aria-hidden="true" /><h3>Accounting behavior</h3><p>Buy fees are added to cost basis. Sell fees reduce realized P&amp;L. Deposits and withdrawals affect cash and contributions, never investment profit.</p></div>
          <div className="note-block"><ShieldCheck aria-hidden="true" /><h3>Private by default</h3><p>Manual entries stay in your local SQLite database. No values are sent to a broker or external market-data provider.</p></div>
        </aside>
      </div>
    </AppShell>
  );
}
