import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseDegiroCsv } from "@/lib/import/degiro";
import { resolveImportedSecurity } from "@/lib/import/security";

export interface DegiroImportReport {
  statementKind: "transactions" | "account";
  detectedRows: number;
  imported: number;
  duplicates: number;
  ignored: number;
  warnings: string[];
}

function fingerprint(parts: Array<string | number | null>) {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");
}

export async function importDegiroCsv(input: {
  brokerAccountId: string;
  csv: string;
  accountToChfRate?: number;
}): Promise<DegiroImportReport> {
  const account = await prisma.brokerAccount.findUnique({ where: { id: input.brokerAccountId } });
  if (!account || account.brokerName.toUpperCase() !== "DEGIRO") {
    throw new Error("Choose a DEGIRO broker account before importing.");
  }

  const parsed = parseDegiroCsv(input.csv, {
    accountBaseCurrency: account.baseCurrency,
    accountToChfRate: input.accountToChfRate,
  });
  let imported = 0;
  let duplicates = 0;
  const warnings = [...parsed.warnings];

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const importFingerprint = fingerprint([
        row.type,
        row.occurredAt,
        row.isin,
        row.brokerSymbol,
        row.quantity,
        row.executionPrice,
        row.transactionCurrency,
        row.totalValue,
        row.fee,
      ]);
      const externalId = row.externalId
        ? `${parsed.kind}:${row.externalId}:${importFingerprint.slice(0, 16)}`
        : `${parsed.kind}:${importFingerprint}`;
      const existing = await tx.transaction.findFirst({
        where: {
          brokerAccountId: account.id,
          OR: [
            { importSource: "DEGIRO", externalId },
            { importFingerprint },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        duplicates += 1;
        continue;
      }

      let securityId: string | null = null;
      if (row.product || row.isin || row.brokerSymbol) {
        const security = await resolveImportedSecurity(tx, {
          source: "DEGIRO",
          brokerAccountId: account.id,
          brokerSymbol: row.brokerSymbol,
          isin: row.isin,
          ticker: row.brokerSymbol,
          name: row.product,
          tradingCurrency: row.transactionCurrency,
          assetType: row.product?.toUpperCase().includes("ETF") ? "ETF" : null,
          authoritativeTradingCurrency: row.type === "BUY" || row.type === "SELL",
        });
        securityId = security.id;
      }
      if ((row.type === "BUY" || row.type === "SELL") && !securityId) {
        warnings.push(`Row ${row.rowNumber} was skipped because the security could not be identified.`);
        continue;
      }

      await tx.transaction.create({
        data: {
          brokerAccountId: account.id,
          securityId,
          type: row.type,
          timestamp: new Date(row.occurredAt),
          quantity: row.quantity,
          executionPrice: row.executionPrice,
          transactionCurrency: row.transactionCurrency,
          fxRateToChf: row.fxRateToChf,
          fee: row.fee,
          feeChf: row.feeChf,
          totalValue: row.totalValue,
          totalValueChf: row.totalValueChf,
          notes: row.notes,
          importSource: "DEGIRO",
          externalId,
          importFingerprint,
        },
      });
      imported += 1;
    }
  });

  return {
    statementKind: parsed.kind,
    detectedRows: parsed.rows.length,
    imported,
    duplicates,
    ignored: parsed.ignoredRows,
    warnings: warnings.slice(0, 20),
  };
}
