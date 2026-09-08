"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PORTFOLIO_REGIONS, refreshRegionalExposures } from "@/lib/portfolio/regional-exposure";

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
