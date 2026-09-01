import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseDegiroCsv, type DegiroImportRow, type DegiroParseResult } from "@/lib/import/degiro";
import { resolveImportedSecurity } from "@/lib/import/security";
import { fxRateProvider, historicalFxKey } from "@/lib/providers/fx";

export interface DegiroImportReport {
  statementKind: "transactions" | "account";
  detectedRows: number;
  imported: number;
  duplicates: number;
  ignored: number;
  quotesUpdated: number;
  warnings: string[];
}

function fingerprint(parts: Array<string | number | null>) {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");
}

type ResolvedDegiroRow = Omit<DegiroImportRow, "fxRateToChf" | "fee" | "feeChf" | "totalValueChf"> & {
  fxRateToChf: number;
  fee: number;
  feeChf: number;
  totalValueChf: number;
};

async function resolveAutomaticFx(parsed: DegiroParseResult): Promise<ResolvedDegiroRow[]> {
  const requests = parsed.rows.flatMap((row) => {
    const values = row.fxRateToChf === null
      ? [{ currency: row.transactionCurrency, date: row.occurredAt }]
      : [];
    if (
      row.sourceFeeAmount > 0
      && row.feeChf === null
      && row.sourceFeeCurrency !== row.transactionCurrency
      && row.sourceFeeCurrency !== "CHF"
    ) values.push({ currency: row.sourceFeeCurrency, date: row.occurredAt });
    return values;
  });
  const rates = await fxRateProvider.getHistoricalRatesToChf(requests);

  return parsed.rows.map((row) => {
    const fxRateToChf = row.fxRateToChf
      ?? rates.get(historicalFxKey(row.transactionCurrency, row.occurredAt));
    if (!fxRateToChf) {
      throw new Error(`No automatic ${row.transactionCurrency}/CHF rate is available for DEGIRO row ${row.rowNumber}.`);
    }
    let feeChf = row.feeChf;
    if (row.sourceFeeAmount === 0) feeChf = 0;
    else if (feeChf === null && row.sourceFeeCurrency === row.transactionCurrency) {
      feeChf = row.sourceFeeAmount * fxRateToChf;
    } else if (feeChf === null && row.sourceFeeCurrency === "CHF") {
      feeChf = row.sourceFeeAmount;
    } else if (feeChf === null) {
      const feeRate = rates.get(historicalFxKey(row.sourceFeeCurrency, row.occurredAt));
      if (feeRate) feeChf = row.sourceFeeAmount * feeRate;
    }
    if (feeChf === null || !Number.isFinite(feeChf) || feeChf < 0) {
      throw new Error(`No automatic ${row.sourceFeeCurrency}/CHF fee rate is available for DEGIRO row ${row.rowNumber}.`);
    }
    return {
      ...row,
      fxRateToChf,
      fee: feeChf / fxRateToChf,
      feeChf,
      totalValueChf: row.totalValue * fxRateToChf,
    };
  });
}

export async function importDegiroCsv(input: {
  brokerAccountId: string;
  csv: string;
}): Promise<DegiroImportReport> {
  const account = await prisma.brokerAccount.findUnique({ where: { id: input.brokerAccountId } });
  if (!account || account.brokerName.toUpperCase() !== "DEGIRO") {
    throw new Error("Choose a DEGIRO broker account before importing.");
  }

  const parsed = parseDegiroCsv(input.csv, { accountBaseCurrency: account.baseCurrency });
  const rows = await resolveAutomaticFx(parsed);
  let imported = 0;
  let duplicates = 0;
  const warnings = [...parsed.warnings];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
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
    quotesUpdated: 0,
    warnings: warnings.slice(0, 20),
  };
}
