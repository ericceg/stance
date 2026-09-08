import { AppShell } from "@/components/app-shell";
import { PortfolioBreakdown } from "@/components/portfolio-breakdown";
import { RegionalExposureManager } from "@/components/regional-exposure-manager";
import { getDashboardData } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function BreakdownPage() {
  const data = await getDashboardData();
  const todayLabel = new Intl.DateTimeFormat("en-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date()).toUpperCase();

  return (
    <AppShell active="Breakdown" eyebrow={todayLabel} issueCount={data.issues.length} title="Portfolio breakdown">
      <PortfolioBreakdown accountCash={data.accountCash} positions={data.positions} summary={data.summary} />
      <RegionalExposureManager positions={data.positions} />
    </AppShell>
  );
}
