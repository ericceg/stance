import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PriceRefreshButton } from "@/components/price-refresh-button";
import { getDashboardData } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function DataIssuesPage() {
  const data = await getDashboardData();
  const hasMissingPrices = data.issues.some((issue) => issue.code === "MISSING_PRICE");
  return (
    <AppShell active="Data issues" eyebrow="Portfolio integrity" issueCount={data.issues.length} title="Data issues">
      <section className="page-card">
        {data.issues.length === 0 ? (
          <div className="empty-state"><CircleCheck aria-hidden="true" /><h2>No unresolved data issues</h2><p>Every open position has an ISIN, a current market price, and a valid CHF conversion rate. Invalid transaction sequences would also appear here.</p><Link className="primary-button" href="/">Return to overview</Link></div>
        ) : (
          <div><div className="section-heading"><div><p>Review required</p><h2>{data.issues.length} unresolved {data.issues.length === 1 ? "issue" : "issues"}</h2></div>{hasMissingPrices ? <PriceRefreshButton /> : null}</div><div className="issues-list">{data.issues.map((issue, index) => <div className="issue-row" key={`${issue.code}-${issue.securityId ?? issue.transactionId ?? index}`}><TriangleAlert aria-hidden="true" /><span><strong>{issue.code.replaceAll("_", " ")}</strong><small>{issue.message}</small></span>{issue.securityId ? <Link href={`/holdings/${issue.securityId}`}>Review</Link> : null}</div>)}</div></div>
        )}
      </section>
    </AppShell>
  );
}
