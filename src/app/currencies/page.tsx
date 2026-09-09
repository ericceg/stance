import { AppShell } from "@/components/app-shell";
import { CurrencyInsights } from "@/components/currency-insights";
import { getCurrencyInsights } from "@/lib/portfolio/currency-insights";
import { loadPortfolio } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export default async function CurrenciesPage() {
  const [portfolio, insight] = await Promise.all([loadPortfolio(), getCurrencyInsights()]);
  return <AppShell active="Currencies" eyebrow="CHF reporting currency" issueCount={portfolio.summary.issues.length} title="Currency impact"><CurrencyInsights insight={insight} /></AppShell>;
}
