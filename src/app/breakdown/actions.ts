"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PORTFOLIO_REGIONS, refreshRegionalExposures } from "@/lib/portfolio/regional-exposure";
import { refreshUnderlyingHoldings } from "@/lib/portfolio/underlying-holdings";

export interface RegionalExposureActionState {
  error?: string;
  message?: string;
}

const regionFieldNames = ["northAmerica", "europe", "pacific", "emergingMarkets", "other"] as const;
const regionByField = Object.fromEntries(PORTFOLIO_REGIONS.map((region, index) => [regionFieldNames[index], region])) as Record<typeof regionFieldNames[number], typeof PORTFOLIO_REGIONS[number]>;
const weight = z.preprocess((value) => value === "" || value === null ? 0 : Number(value), z.number().min(0).max(100));
const manualExposureSchema = z.object({
  securityId: z.string().min(1),
  northAmerica: weight,
  europe: weight,
  pacific: weight,
  emergingMarkets: weight,
  other: weight,
});

const constituentLineSchema = z.object({
  ticker: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(160),
  weight: z.number().positive().max(100),
});

function parseConstituents(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return { error: "Paste the constituent list." } as const;
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.map((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((cell) => cell.trim());
    const parsed = constituentLineSchema.safeParse({
      ticker: cells[0],
      name: cells.slice(1, -1).join(", "),
      weight: Number(cells.at(-1)),
    });
    return parsed.success ? parsed.data : { line: index + 1 };
  });
  const invalid = rows.find((row): row is { line: number } => "line" in row);
  if (invalid) return { error: `Line ${invalid.line} must be Ticker, Company name, Weight (%).` } as const;
  const validRows = rows.filter((row): row is z.infer<typeof constituentLineSchema> => !("line" in row));
  const seen = new Set<string>();
  const duplicate = validRows.find((row) => seen.has(row.ticker.toUpperCase()) || !seen.add(row.ticker.toUpperCase()));
  if (duplicate) return { error: `Duplicate ticker: ${duplicate.ticker}.` } as const;
  const total = validRows.reduce((sum, row) => sum + row.weight, 0);
  if (total > 100.05) return { error: `Constituent weights cannot exceed 100% (currently ${total.toFixed(2)}%).` } as const;
  return { rows: validRows, total } as const;
}

function revalidatePortfolio() {
  revalidatePath("/");
  revalidatePath("/breakdown");
  revalidatePath("/import");
}

export async function saveManualRegionalExposureAction(
  _previousState: RegionalExposureActionState,
  formData: FormData,
): Promise<RegionalExposureActionState> {
  const parsed = manualExposureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Use percentages between 0 and 100." };
  const rows = regionFieldNames
    .map((field) => ({ region: regionByField[field], weight: parsed.data[field] }))
    .filter((row) => row.weight > 0);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(total - 100) > 0.05) return { error: `Regional weights must total 100% (currently ${total.toFixed(2)}%).` };
  const security = await prisma.security.findUnique({ where: { id: parsed.data.securityId }, select: { name: true } });
  if (!security) return { error: "That security no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.securityRegionalExposure.deleteMany({ where: { securityId: parsed.data.securityId } });
    await tx.securityRegionalExposure.createMany({
      data: rows.map((row) => ({ ...row, securityId: parsed.data.securityId, source: "MANUAL", asOf: new Date() })),
    });
  });
  revalidatePortfolio();
  return { message: `Saved manual regional exposure for ${security.name}.` };
}

export async function refreshRegionalExposureAction(
  _previousState: RegionalExposureActionState,
  _formData: FormData,
): Promise<RegionalExposureActionState> {
  void _previousState;
  void _formData;
  try {
    const report = await refreshRegionalExposures();
    revalidatePortfolio();
    const warning = report.warnings[0] ? ` ${report.warnings[0]}` : "";
    return {
      message: `Updated ${report.updated} securities; ${report.skippedManual} manual overrides preserved; ${report.unresolved} unresolved.${warning}`,
    };
  } catch (error) {
    console.error("Regional exposure refresh failed", error);
    return { error: error instanceof Error ? error.message : "Regional exposure could not be refreshed." };
  }
}

export async function restoreAutomaticRegionalExposureAction(
  _previousState: RegionalExposureActionState,
  formData: FormData,
): Promise<RegionalExposureActionState> {
  const securityId = z.string().min(1).safeParse(formData.get("securityId"));
  if (!securityId.success) return { error: "Choose a security first." };
  await prisma.securityRegionalExposure.deleteMany({ where: { securityId: securityId.data, source: "MANUAL" } });
  const report = await refreshRegionalExposures([securityId.data]);
  revalidatePortfolio();
  return report.updated > 0
    ? { message: "Restored the automatic regional exposure." }
    : { message: "Manual values were cleared, but no automatic source is available for this security." };
}

export async function saveManualUnderlyingHoldingsAction(
  _previousState: RegionalExposureActionState,
  formData: FormData,
): Promise<RegionalExposureActionState> {
  const securityId = z.string().min(1).safeParse(formData.get("securityId"));
  if (!securityId.success) return { error: "Choose an ETF first." };
  const parsed = parseConstituents(formData.get("constituents"));
  if ("error" in parsed) return { error: parsed.error };
  const security = await prisma.security.findUnique({ where: { id: securityId.data }, select: { name: true, assetType: true } });
  if (!security || security.assetType !== "ETF") return { error: "That ETF no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.securityUnderlyingHolding.deleteMany({ where: { securityId: securityId.data } });
    if (parsed.rows.length > 0) await tx.securityUnderlyingHolding.createMany({
      data: parsed.rows.map((row) => ({
        securityId: securityId.data,
        constituentTicker: row.ticker.toUpperCase(),
        constituentName: row.name,
        weight: row.weight,
        source: "MANUAL",
        asOf: new Date(),
      })),
    });
  });
  revalidatePortfolio();
  return { message: parsed.rows.length === 0 ? `Cleared constituents for ${security.name}.` : `Saved ${parsed.rows.length} constituents (${parsed.total.toFixed(2)}% coverage) for ${security.name}.` };
}

export async function refreshUnderlyingHoldingsAction(
  _previousState: RegionalExposureActionState,
  _formData: FormData,
): Promise<RegionalExposureActionState> {
  void _previousState;
  void _formData;
  try {
    const report = await refreshUnderlyingHoldings();
    revalidatePortfolio();
    const warning = report.warnings[0] ? ` ${report.warnings[0]}` : "";
    return { message: `Updated ${report.updated} ETFs; ${report.skippedManual} manual overrides preserved; ${report.unresolved} unsupported or unresolved.${warning}` };
  } catch (error) {
    console.error("ETF constituent refresh failed", error);
    return { error: error instanceof Error ? error.message : "ETF constituents could not be refreshed." };
  }
}

export async function restoreAutomaticUnderlyingHoldingsAction(
  _previousState: RegionalExposureActionState,
  formData: FormData,
): Promise<RegionalExposureActionState> {
  const securityId = z.string().min(1).safeParse(formData.get("securityId"));
  if (!securityId.success) return { error: "Choose an ETF first." };
  await prisma.securityUnderlyingHolding.deleteMany({ where: { securityId: securityId.data, source: "MANUAL" } });
  const report = await refreshUnderlyingHoldings([securityId.data]);
  revalidatePortfolio();
  return report.updated > 0
    ? { message: "Restored the automatic ETF constituents." }
    : { message: "Manual values were cleared, but no automatic source is available for this ETF." };
}
