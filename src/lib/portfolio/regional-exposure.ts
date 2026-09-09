import "server-only";

import type { Security } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseIsharesGeographicExposure, parseVanguardMarketAllocation, type ParsedExposure, type PortfolioRegion } from "./regional-exposure-parser";
export { PORTFOLIO_REGIONS } from "./regional-exposure-parser";

interface AutomaticExposure {
  exposures: ParsedExposure[];
  source: string;
  sourceUrl?: string;
  asOf?: Date;
}

const vanguardFunds: Record<string, string> = {
  IE00BK5BQT80: "https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits-etf-usd-accumulating",
  IE000VAHT5T0: "https://www.vanguard.co.uk/professional/product/etf/equity/E161/ftse-global-all-cap-ucits-etf-usd-acc.html",
};

const isharesFunds: Record<string, string> = {
  IE00B4L5Y983: "https://www.ishares.com/uk/individual/en/products/251882/ishares-core-msci-world-ucits-etf",
  IE00BKM4GZ66: "https://www.ishares.com/uk/individual/en/products/264659/ishares-core-msci-em-imi-ucits-etf",
  CH0237935637: "https://www.ishares.com/ch/individual/en/products/264108/ishares-swiss-dividend-ch-fund",
};

const knownMandates: Record<string, AutomaticExposure> = {
  IE00BKM4GZ66: {
    exposures: [{ region: "Emerging Markets", weight: 100 }],
    source: "AUTOMATIC_MANDATE",
    sourceUrl: "https://www.ishares.com/uk/individual/en/products/264659/ishares-core-msci-em-imi-ucits-etf",
  },
  CH0237935637: {
    exposures: [{ region: "Europe", weight: 100 }],
    source: "AUTOMATIC_MANDATE",
    sourceUrl: "https://www.ishares.com/ch/individual/en/products/264108/ishares-swiss-dividend-ch-fund",
  },
};

const isinRegion: Record<string, PortfolioRegion> = {
  US: "North America", CA: "North America",
  CH: "Europe", DE: "Europe", AT: "Europe", BE: "Europe", DK: "Europe", ES: "Europe",
  FI: "Europe", FR: "Europe", GB: "Europe", GR: "Europe", IE: "Europe", IS: "Europe",
  IT: "Europe", LI: "Europe", LU: "Europe", NL: "Europe", NO: "Europe", PL: "Europe",
  PT: "Europe", SE: "Europe",
  AU: "Pacific", HK: "Pacific", JP: "Pacific", NZ: "Pacific", SG: "Pacific",
  BR: "Emerging Markets", CL: "Emerging Markets", CN: "Emerging Markets", CO: "Emerging Markets",
  CZ: "Emerging Markets", EG: "Emerging Markets", HU: "Emerging Markets", ID: "Emerging Markets",
  IN: "Emerging Markets", KR: "Emerging Markets", MX: "Emerging Markets", MY: "Emerging Markets",
  PE: "Emerging Markets", PH: "Emerging Markets", QA: "Emerging Markets", SA: "Emerging Markets",
  TH: "Emerging Markets", TR: "Emerging Markets", TW: "Emerging Markets", ZA: "Emerging Markets",
};

async function fetchVanguardExposure(url: string): Promise<AutomaticExposure | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Stance/1.0 regional-exposure refresh" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Vanguard returned HTTP ${response.status}.`);
  const parsed = parseVanguardMarketAllocation(await response.text());
  return parsed ? { ...parsed, source: "VANGUARD", sourceUrl: url } : null;
}

async function fetchIsharesExposure(url: string): Promise<AutomaticExposure | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Stance/1.0 regional-exposure refresh" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`iShares returned HTTP ${response.status}.`);
  const parsed = parseIsharesGeographicExposure(await response.text());
  return parsed ? { ...parsed, source: "ISHARES", sourceUrl: url } : null;
}

export async function resolveAutomaticExposure(security: Pick<Security, "isin" | "assetType">): Promise<AutomaticExposure | null> {
  const isin = security.isin?.toUpperCase();
  if (!isin) return null;
  if (vanguardFunds[isin]) return fetchVanguardExposure(vanguardFunds[isin]);
  if (isharesFunds[isin]) {
    try {
      const exposure = await fetchIsharesExposure(isharesFunds[isin]);
      if (exposure) return exposure;
    } catch (error) {
      if (!knownMandates[isin]) throw error;
    }
  }
  if (knownMandates[isin]) return knownMandates[isin];
  if (security.assetType === "ETF") return null;
  const region = isinRegion[isin.slice(0, 2)];
  return region ? {
    exposures: [{ region, weight: 100 }],
    source: "AUTOMATIC_ISIN",
  } : null;
}

async function replaceAutomaticExposure(securityId: string, result: AutomaticExposure) {
  return prisma.$transaction(async (tx) => {
    const manualCount = await tx.securityRegionalExposure.count({ where: { securityId, source: "MANUAL" } });
    if (manualCount > 0) return false;
    await tx.securityRegionalExposure.deleteMany({ where: { securityId } });
    await tx.securityRegionalExposure.createMany({
      data: result.exposures.map((exposure) => ({
        securityId,
        region: exposure.region,
        weight: exposure.weight,
        source: result.source,
        sourceUrl: result.sourceUrl,
        asOf: result.asOf,
      })),
    });
    return true;
  });
}

export interface RegionalExposureSyncReport {
  attempted: number;
  updated: number;
  skippedManual: number;
  unresolved: number;
  warnings: string[];
}

export async function refreshRegionalExposures(securityIds?: string[]): Promise<RegionalExposureSyncReport> {
  const securities = await prisma.security.findMany({
    where: securityIds ? { id: { in: securityIds } } : undefined,
    include: { regionalExposures: true },
  });
  const report: RegionalExposureSyncReport = { attempted: securities.length, updated: 0, skippedManual: 0, unresolved: 0, warnings: [] };
  const candidates = securities.filter((security) => {
    if (security.regionalExposures.some((row) => row.source === "MANUAL")) {
      report.skippedManual += 1;
      return false;
    }
    return true;
  });
  const resolved = await Promise.all(candidates.map(async (security) => {
    try {
      return { security, result: await resolveAutomaticExposure(security) };
    } catch (error) {
      return { security, error };
    }
  }));
  for (const outcome of resolved) {
    if ("error" in outcome) {
      report.unresolved += 1;
      report.warnings.push(`${outcome.security.name}: ${outcome.error instanceof Error ? outcome.error.message : "regional data could not be refreshed"}`);
      continue;
    }
    try {
      const { security, result } = outcome;
      if (!result) {
        report.unresolved += 1;
        continue;
      }
      if (await replaceAutomaticExposure(security.id, result)) report.updated += 1;
      else report.skippedManual += 1;
    } catch (error) {
      report.unresolved += 1;
      report.warnings.push(`${outcome.security.name}: ${error instanceof Error ? error.message : "regional data could not be saved"}`);
    }
  }
  return report;
}
