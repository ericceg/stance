"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { importDegiroCsv, type DegiroImportReport } from "@/lib/import/degiro-import";
import { syncTrading212, type Trading212SyncReport } from "@/lib/import/trading212-sync";
import { refreshOpenPositionQuotes } from "@/lib/portfolio/market-data-sync";
import { rebuildPortfolioHistory } from "@/lib/portfolio/history-rebuild";
import { refreshRegionalExposures } from "@/lib/portfolio/regional-exposure";
import { refreshUnderlyingHoldings } from "@/lib/portfolio/underlying-holdings";

export interface DegiroImportState {
  error?: string;
  report?: DegiroImportReport;
}

export interface Trading212SyncState {
  error?: string;
  report?: Trading212SyncReport;
}

const degiroFieldsSchema = z.object({
  brokerAccountId: z.string().min(1),
  accountName: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});

async function rebuildHistoryAfterImport() {
  try {
    const report = await rebuildPortfolioHistory();
    return report.warnings;
  } catch (error) {
    console.error("Portfolio history rebuild failed", error);
    await prisma.portfolioSnapshot.deleteMany();
    return [error instanceof Error
      ? `Historical performance could not be rebuilt: ${error.message}`
      : "Historical performance could not be rebuilt."];
  }
}

async function refreshRegionsAfterImport() {
  try {
    const report = await refreshRegionalExposures();
    return report.warnings;
  } catch (error) {
    console.error("Regional exposure refresh failed", error);
    return [error instanceof Error
      ? `Regional exposure could not be refreshed: ${error.message}`
      : "Regional exposure could not be refreshed."];
  }
}

async function refreshUnderlyingHoldingsAfterImport() {
  try {
    const report = await refreshUnderlyingHoldings();
    return report.warnings;
  } catch (error) {
    console.error("ETF constituent refresh failed", error);
    return [error instanceof Error ? `ETF constituent refresh failed: ${error.message}` : "ETF constituents could not be refreshed."];
  }
}

export async function importDegiroAction(
  _previousState: DegiroImportState,
  formData: FormData,
): Promise<DegiroImportState> {
  const parsed = degiroFieldsSchema.safeParse({
    brokerAccountId: formData.get("brokerAccountId"),
    accountName: formData.get("accountName") || "Personal",
    baseCurrency: formData.get("baseCurrency") || "CHF",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the DEGIRO account details." };
  }
  const file = formData.get("statement");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a DEGIRO CSV statement." };
  if (file.size > 10 * 1024 * 1024) return { error: "The CSV is larger than the 10 MB import limit." };
  if (!file.name.toLowerCase().endsWith(".csv")) return { error: "DEGIRO imports must be CSV files." };

  try {
    let brokerAccountId = parsed.data.brokerAccountId;
    if (brokerAccountId === "new") {
      const account = await prisma.brokerAccount.upsert({
        where: {
          brokerName_accountName: { brokerName: "DEGIRO", accountName: parsed.data.accountName },
        },
        create: {
          brokerName: "DEGIRO",
          accountName: parsed.data.accountName,
          baseCurrency: parsed.data.baseCurrency,
        },
        update: { baseCurrency: parsed.data.baseCurrency },
      });
      brokerAccountId = account.id;
    }
    const report = await importDegiroCsv({
      brokerAccountId,
      csv: await file.text(),
    });
    const quoteReport = await refreshOpenPositionQuotes();
    const [historyWarnings, regionWarnings, constituentWarnings] = await Promise.all([rebuildHistoryAfterImport(), refreshRegionsAfterImport(), refreshUnderlyingHoldingsAfterImport()]);
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/data-issues");
    revalidatePath("/import");
    revalidatePath("/breakdown");
    return { report: { ...report, quotesUpdated: quoteReport.updated, warnings: [...report.warnings, ...quoteReport.warnings, ...historyWarnings, ...regionWarnings, ...constituentWarnings] } };
  } catch (error) {
    console.error("DEGIRO import failed", error);
    return { error: error instanceof Error ? error.message : "The DEGIRO statement could not be imported." };
  }
}

export async function syncTrading212Action(
  _previousState: Trading212SyncState,
  _formData: FormData,
): Promise<Trading212SyncState> {
  void _previousState;
  void _formData;
  try {
    const report = await syncTrading212();
    const quoteReport = await refreshOpenPositionQuotes();
    const [historyWarnings, regionWarnings, constituentWarnings] = await Promise.all([rebuildHistoryAfterImport(), refreshRegionsAfterImport(), refreshUnderlyingHoldingsAfterImport()]);
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/data-issues");
    revalidatePath("/import");
    revalidatePath("/breakdown");
    return {
      report: {
        ...report,
        quotesUpdated: report.quotesUpdated + quoteReport.updated,
        warnings: [...report.warnings, ...quoteReport.warnings, ...historyWarnings, ...regionWarnings, ...constituentWarnings],
      },
    };
  } catch (error) {
    console.error("Trading 212 sync failed", error);
    return { error: error instanceof Error ? error.message : "Trading 212 could not be synchronized." };
  }
}
