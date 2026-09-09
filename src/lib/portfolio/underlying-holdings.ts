import "server-only";

import type { Security } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseVanguardUnderlyingHoldings, type ParsedUnderlyingHolding } from "./underlying-holdings-parser";

const vanguardFunds: Record<string, string> = {
  IE00BK5BQT80: "https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits",
  IE000VAHT5T0: "https://www.vanguard.co.uk/professional/product/etf/equity/E161/ftse-global-all-cap-ucits-etf-usd-acc.html",
};

interface AutomaticHoldings {
  holdings: ParsedUnderlyingHolding[];
  source: string;
  sourceUrl: string;
  asOf?: Date;
}

export async function resolveAutomaticUnderlyingHoldings(security: Pick<Security, "isin" | "assetType">): Promise<AutomaticHoldings | null> {
  if (security.assetType !== "ETF") return null;
  const isin = security.isin?.toUpperCase();
  const sourceUrl = isin ? vanguardFunds[isin] : undefined;
  if (!sourceUrl) return null;
  const response = await fetch(sourceUrl, { headers: { "User-Agent": "Stance/1.0 ETF holdings refresh" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Vanguard returned HTTP ${response.status}.`);
  const parsed = parseVanguardUnderlyingHoldings(await response.text());
  return parsed ? { ...parsed, source: "VANGUARD", sourceUrl } : null;
}

async function replaceAutomaticHoldings(securityId: string, result: AutomaticHoldings) {
  return prisma.$transaction(async (tx) => {
    const manualCount = await tx.securityUnderlyingHolding.count({ where: { securityId, source: "MANUAL" } });
    if (manualCount > 0) return false;
    await tx.securityUnderlyingHolding.deleteMany({ where: { securityId } });
    await tx.securityUnderlyingHolding.createMany({ data: result.holdings.map((holding) => ({
      securityId,
      constituentTicker: holding.ticker,
      constituentName: holding.name,
      weight: holding.weight,
      source: result.source,
      sourceUrl: result.sourceUrl,
      asOf: result.asOf,
    })) });
    return true;
  });
}

export interface UnderlyingHoldingsSyncReport {
  attempted: number;
  updated: number;
  skippedManual: number;
  unresolved: number;
  warnings: string[];
}

export async function refreshUnderlyingHoldings(securityIds?: string[]): Promise<UnderlyingHoldingsSyncReport> {
  const securities = await prisma.security.findMany({ where: { assetType: "ETF", ...(securityIds ? { id: { in: securityIds } } : {}) }, include: { underlyingHoldings: true } });
  const report: UnderlyingHoldingsSyncReport = { attempted: securities.length, updated: 0, skippedManual: 0, unresolved: 0, warnings: [] };
  for (const security of securities) {
    if (security.underlyingHoldings.some((holding) => holding.source === "MANUAL")) { report.skippedManual += 1; continue; }
    try {
      const result = await resolveAutomaticUnderlyingHoldings(security);
      if (!result) { report.unresolved += 1; continue; }
      if (await replaceAutomaticHoldings(security.id, result)) report.updated += 1;
      else report.skippedManual += 1;
    } catch (error) {
      report.unresolved += 1;
      report.warnings.push(`${security.name}: ${error instanceof Error ? error.message : "constituents could not be refreshed"}`);
    }
  }
  return report;
}
