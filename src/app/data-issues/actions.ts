"use server";

import { revalidatePortfolioViews } from "@/lib/portfolio/mutations";
import { refreshOpenPositionQuotes } from "@/lib/portfolio/market-data-sync";
import { recordCurrentPortfolioSnapshot } from "@/lib/portfolio/service";

export interface PriceRefreshState {
  error?: string;
  message?: string;
}

export async function refreshPricesAction(): Promise<PriceRefreshState> {
  try {
    const report = await refreshOpenPositionQuotes();
    // Preserve each successful refresh as an intraday performance point. The
    // chart keeps these alongside the daily reconstructed closing history.
    const snapshot = report.updated > 0 ? await recordCurrentPortfolioSnapshot() : null;
    revalidatePortfolioViews();
    if (report.warnings.length > 0) {
      return { error: `Refreshed ${report.updated} of ${report.attempted} prices. ${report.warnings[0]}` };
    }
    return { message: `Refreshed ${report.updated} ${report.updated === 1 ? "price" : "prices"}.${snapshot ? " Added a comparable intraday performance point." : " Live quotes are mixed, so no misleading intraday performance point was added."}` };
  } catch (error) {
    console.error("Market price refresh failed", error);
    return { error: error instanceof Error ? error.message : "Market prices could not be refreshed." };
  }
}
