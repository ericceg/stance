import { AppShell } from "@/components/app-shell";
import { HoldingsTable } from "@/components/holdings-table";
import { getDashboardData } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const data = await getDashboardData();
  return <AppShell active="Holdings" eyebrow="Your investments" title="Holdings" issueCount={data.issues.length}>
    <HoldingsTable positions={data.positions} />
  </AppShell>;
}
