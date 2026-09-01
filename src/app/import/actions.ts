"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { importDegiroCsv, type DegiroImportReport } from "@/lib/import/degiro-import";
import { syncTrading212, type Trading212SyncReport } from "@/lib/import/trading212-sync";

export interface DegiroImportState {
  error?: string;
  report?: DegiroImportReport;
}

export interface Trading212SyncState {
  error?: string;
  report?: Trading212SyncReport;
}

const optionalRate = z.preprocess(
  (value) => value === "" || value === null ? undefined : Number(value),
  z.number().positive("The CHF rate must be positive.").optional(),
);

const degiroFieldsSchema = z.object({
  brokerAccountId: z.string().min(1),
  accountName: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  accountToChfRate: optionalRate,
});

export async function importDegiroAction(
  _previousState: DegiroImportState,
  formData: FormData,
): Promise<DegiroImportState> {
  const parsed = degiroFieldsSchema.safeParse({
    brokerAccountId: formData.get("brokerAccountId"),
    accountName: formData.get("accountName") || "Personal",
    baseCurrency: formData.get("baseCurrency") || "CHF",
    accountToChfRate: formData.get("accountToChfRate"),
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
      accountToChfRate: parsed.data.accountToChfRate,
    });
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/data-issues");
    revalidatePath("/import");
    return { report };
  } catch (error) {
    console.error("DEGIRO import failed", error);
    return { error: error instanceof Error ? error.message : "The DEGIRO statement could not be imported." };
  }
}

const trading212FieldsSchema = z.object({ accountToChfRate: optionalRate });

export async function syncTrading212Action(
  _previousState: Trading212SyncState,
  formData: FormData,
): Promise<Trading212SyncState> {
  const parsed = trading212FieldsSchema.safeParse({ accountToChfRate: formData.get("accountToChfRate") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the CHF rate." };

  try {
    const report = await syncTrading212({ accountToChfRate: parsed.data.accountToChfRate });
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/data-issues");
    revalidatePath("/import");
    return { report };
  } catch (error) {
    console.error("Trading 212 sync failed", error);
    return { error: error instanceof Error ? error.message : "Trading 212 could not be synchronized." };
  }
}
