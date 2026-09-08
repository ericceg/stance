import { AppShell } from "@/components/app-shell";
import { ImportHub } from "@/components/import-hub";
import { prisma } from "@/lib/db";
import { getDashboardData } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

function formatImportDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function ImportPage() {
  const [accounts, dashboard, lastTrading212, lastDegiro] = await Promise.all([
    prisma.brokerAccount.findMany({ where: { brokerName: "DEGIRO" }, orderBy: { accountName: "asc" } }),
    getDashboardData(),
    prisma.transaction.findFirst({ where: { importSource: "TRADING212" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.transaction.findFirst({ where: { importSource: "DEGIRO" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  return (
    <AppShell active="Import" eyebrow="Broker connections" issueCount={dashboard.issues.length} title="Import & sync">
      <div className="import-intro">
        <div><p>Bring your portfolio together</p><h2>Connect Trading 212 or upload DEGIRO statements</h2></div>
        <span>Keep your accounts up to date in one place. Duplicate transactions are automatically skipped.</span>
      </div>
      <ImportHub
        accounts={accounts.map((account) => ({ id: account.id, accountName: account.accountName, baseCurrency: account.baseCurrency }))}
        lastDegiroImport={formatImportDate(lastDegiro?.updatedAt ?? null)}
        lastTrading212Sync={formatImportDate(lastTrading212?.updatedAt ?? null)}
        trading212Configured={Boolean(process.env.TRADING212_API_KEY?.trim() && process.env.TRADING212_API_SECRET?.trim())}
      />
    </AppShell>
  );
}
