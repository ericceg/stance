import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveImportedSecurity } from "@/lib/import/security";
import {
  Trading212Provider,
  type Trading212HistoricalOrder,
  type Trading212Position,
} from "@/lib/providers/broker";
import { fxRateProvider, historicalFxKey, type HistoricalFxRequest } from "@/lib/providers/fx";

export interface Trading212SyncReport {
  accountCurrency: string;
  fetched: number;
  imported: number;
  duplicates: number;
  quotesUpdated: number;
  skipped: number;
  warnings: string[];
}

function fingerprint(parts: Array<string | number | null | undefined>) {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");
}

function positiveRate(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function transactionType(type: string) {
  if (type === "WITHDRAW") return "WITHDRAWAL" as const;
  if (type === "DEPOSIT") return "DEPOSIT" as const;
  if (type === "FEE") return "FEE" as const;
  if (type === "INTEREST_ON_FREE_CASH" || type === "LENDING_INTEREST") return "DIVIDEND" as const;
  return null;
}

function localToAccountRate(order: Trading212HistoricalOrder, fill: NonNullable<Trading212HistoricalOrder["fill"]>) {
  const gross = Math.abs(fill.price * fill.quantity);
  const explicit = positiveRate(fill.walletImpact.fxRate);
  if (explicit) return explicit;
  if (order.order.instrument.currency === fill.walletImpact.currency) return 1;
  const derived = gross > 0 ? Math.abs(fill.walletImpact.netValue) / gross : 0;
  return derived > 0 ? derived : null;
}

async function accountForSync(
  tx: Prisma.TransactionClient,
  accountId: string,
  currency: string,
) {
  const existing = await tx.brokerAccount.findFirst({
    where: { brokerName: "Trading 212" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return tx.brokerAccount.update({
      where: { id: existing.id },
      data: { baseCurrency: currency, accountName: existing.accountName || `Invest #${accountId}` },
    });
  }
  return tx.brokerAccount.create({
    data: { brokerName: "Trading 212", accountName: `Invest #${accountId}`, baseCurrency: currency },
  });
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function updatePositionQuote(
  tx: Prisma.TransactionClient,
  accountId: string,
  position: Trading212Position,
  accountToChfRate: number,
) {
  const security = await resolveImportedSecurity(tx, {
    source: "TRADING212",
    brokerAccountId: accountId,
    brokerSymbol: position.instrument.ticker,
    sourceSecurityId: position.instrument.ticker,
    isin: position.instrument.isin ?? null,
    ticker: position.instrument.ticker,
    name: position.instrument.name,
    tradingCurrency: position.instrument.currency,
    assetType: position.instrument.type,
  });
  const grossLocal = Math.abs(position.currentPrice * position.quantity);
  const localToAccount = position.instrument.currency === position.walletImpact.currency
    ? 1
    : grossLocal > 0
      ? Math.abs(position.walletImpact.currentValue) / grossLocal
      : 0;
  if (position.currentPrice <= 0 || localToAccount <= 0) return false;
  await tx.priceQuote.upsert({
    where: { securityId: security.id },
    create: {
      securityId: security.id,
      price: position.currentPrice,
      previousClose: null,
      currency: position.instrument.currency,
      fxRateToChf: localToAccount * accountToChfRate,
      provider: "TRADING212",
      quotedAt: new Date(),
    },
    update: {
      price: position.currentPrice,
      currency: position.instrument.currency,
      fxRateToChf: localToAccount * accountToChfRate,
      provider: "TRADING212",
      quotedAt: new Date(),
    },
  });
  return true;
}

export async function syncTrading212(): Promise<Trading212SyncReport> {
  const provider = new Trading212Provider();
  const account = await provider.getAccountSummary();
  const accountCurrency = account.currency.toUpperCase();

  const [positions, orders, dividends, cashTransactions] = await Promise.all([
    provider.getOpenPositions(),
    provider.getHistoricalOrders(),
    provider.getPaidDividends(),
    provider.getCashHistory(),
  ]);
  const historicalRequests: HistoricalFxRequest[] = [];
  for (const order of orders) {
    const fill = order.fill;
    const occurredAt = fill ? validDate(fill.filledAt) : null;
    if (!fill || !occurredAt) continue;
    historicalRequests.push({ currency: accountCurrency, date: occurredAt });
    for (const tax of fill.walletImpact.taxes) {
      if (tax.currency !== order.order.instrument.currency && tax.currency !== accountCurrency) {
        historicalRequests.push({ currency: tax.currency, date: validDate(tax.chargedAt ?? "") ?? occurredAt });
      }
    }
  }
  for (const dividend of dividends) {
    const occurredAt = validDate(dividend.paidOn);
    if (occurredAt) historicalRequests.push({ currency: dividend.currency, date: occurredAt });
  }
  for (const cash of cashTransactions) {
    const occurredAt = validDate(cash.dateTime);
    if (occurredAt) historicalRequests.push({ currency: cash.currency, date: occurredAt });
  }
  const [accountToChfRate, historicalRates] = await Promise.all([
    fxRateProvider.getCurrentRateToChf(accountCurrency),
    fxRateProvider.getHistoricalRatesToChf(historicalRequests),
  ]);
  const historicalRate = (currency: string, date: Date) => {
    const rate = historicalRates.get(historicalFxKey(currency, date));
    if (!rate) throw new Error(`No automatic ${currency}/CHF rate is available for ${date.toISOString().slice(0, 10)}.`);
    return rate;
  };
  let imported = 0;
  let duplicates = 0;
  let quotesUpdated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  await prisma.$transaction(async (tx) => {
    const brokerAccount = await accountForSync(tx, String(account.id), accountCurrency);
    const existingTransactions = await tx.transaction.findMany({
      where: { brokerAccountId: brokerAccount.id, importSource: "TRADING212" },
      select: { externalId: true, importFingerprint: true },
    });
    const existingExternalIds = new Set(existingTransactions.flatMap((item) => item.externalId ? [item.externalId] : []));
    const existingFingerprints = new Set(existingTransactions.flatMap((item) => item.importFingerprint ? [item.importFingerprint] : []));

    for (const order of orders) {
      const fill = order.fill;
      if (!fill || fill.type !== "TRADE") {
        skipped += 1;
        continue;
      }
      const occurredAt = validDate(fill.filledAt);
      const quantity = Math.abs(fill.quantity);
      const executionPrice = Math.abs(fill.price);
      const instrumentToAccount = localToAccountRate(order, fill);
      if (!occurredAt || quantity <= 0 || executionPrice <= 0 || !instrumentToAccount) {
        warnings.push(`Fill ${fill.id} was skipped because its date, value, or FX rate is invalid.`);
        skipped += 1;
        continue;
      }
      const accountToChfAtExecution = historicalRate(accountCurrency, occurredAt);
      const externalId = `fill:${fill.id}`;
      const importFingerprint = fingerprint([externalId, order.order.side, fill.filledAt, quantity, executionPrice]);
      if (existingExternalIds.has(externalId) || existingFingerprints.has(importFingerprint)) {
        duplicates += 1;
        continue;
      }
      const security = await resolveImportedSecurity(tx, {
        source: "TRADING212",
        brokerAccountId: brokerAccount.id,
        brokerSymbol: order.order.instrument.ticker,
        sourceSecurityId: order.order.instrument.ticker,
        isin: order.order.instrument.isin ?? null,
        ticker: order.order.instrument.ticker,
        name: order.order.instrument.name,
        tradingCurrency: order.order.instrument.currency,
        assetType: order.order.instrument.type,
      });
      const fxRateToChf = instrumentToAccount * accountToChfAtExecution;
      const feeChf = fill.walletImpact.taxes.reduce((total, tax) => {
        const amount = Math.abs(tax.quantity);
        if (tax.currency === order.order.instrument.currency) return total + amount * fxRateToChf;
        if (tax.currency === accountCurrency) return total + amount * accountToChfAtExecution;
        return total + amount * historicalRate(tax.currency, validDate(tax.chargedAt ?? "") ?? occurredAt);
      }, 0);
      const totalValue = quantity * executionPrice;
      await tx.transaction.create({
        data: {
          brokerAccountId: brokerAccount.id,
          securityId: security.id,
          type: order.order.side,
          timestamp: occurredAt,
          quantity,
          executionPrice,
          transactionCurrency: order.order.instrument.currency,
          fxRateToChf,
          fee: feeChf / fxRateToChf,
          feeChf,
          totalValue,
          totalValueChf: totalValue * fxRateToChf,
          notes: `Trading 212 order ${order.order.id}`,
          importSource: "TRADING212",
          externalId,
          importFingerprint,
        },
      });
      existingExternalIds.add(externalId);
      existingFingerprints.add(importFingerprint);
      imported += 1;
    }

    for (const dividend of dividends) {
      const occurredAt = validDate(dividend.paidOn);
      if (!occurredAt || dividend.amount === 0) {
        skipped += 1;
        continue;
      }
      const importFingerprint = fingerprint(["dividend", dividend.reference, dividend.paidOn, dividend.amount, dividend.instrument.ticker]);
      const externalId = dividend.reference.trim()
        ? `dividend:${dividend.reference}`
        : `dividend:${importFingerprint}`;
      if (existingExternalIds.has(externalId) || existingFingerprints.has(importFingerprint)) {
        duplicates += 1;
        continue;
      }
      const security = await resolveImportedSecurity(tx, {
        source: "TRADING212",
        brokerAccountId: brokerAccount.id,
        brokerSymbol: dividend.instrument.ticker,
        sourceSecurityId: dividend.instrument.ticker,
        isin: dividend.instrument.isin ?? null,
        ticker: dividend.instrument.ticker,
        name: dividend.instrument.name,
        tradingCurrency: dividend.instrument.currency,
        assetType: dividend.instrument.type,
      });
      const totalValue = Math.abs(dividend.amount);
      const currency = dividend.currency.toUpperCase();
      const fxRateToChf = historicalRate(currency, occurredAt);
      await tx.transaction.create({
        data: {
          brokerAccountId: brokerAccount.id,
          securityId: security.id,
          type: "DIVIDEND",
          timestamp: occurredAt,
          transactionCurrency: currency,
          fxRateToChf,
          fee: 0,
          feeChf: 0,
          totalValue,
          totalValueChf: totalValue * fxRateToChf,
          notes: `Trading 212 ${dividend.type.toLowerCase().replaceAll("_", " ")}`,
          importSource: "TRADING212",
          externalId,
          importFingerprint,
        },
      });
      existingExternalIds.add(externalId);
      existingFingerprints.add(importFingerprint);
      imported += 1;
    }

    for (const cash of cashTransactions) {
      const type = transactionType(cash.type);
      if (!type) {
        skipped += 1;
        continue;
      }
      const occurredAt = validDate(cash.dateTime);
      if (!occurredAt || cash.amount === 0) {
        skipped += 1;
        continue;
      }
      const importFingerprint = fingerprint(["cash", cash.reference, cash.type, cash.dateTime, cash.amount, cash.currency]);
      const externalId = cash.reference.trim()
        ? `cash:${cash.reference}`
        : `cash:${importFingerprint}`;
      if (existingExternalIds.has(externalId) || existingFingerprints.has(importFingerprint)) {
        duplicates += 1;
        continue;
      }
      const currency = cash.currency.toUpperCase();
      const fxRateToChf = historicalRate(currency, occurredAt);
      const totalValue = Math.abs(cash.amount);
      await tx.transaction.create({
        data: {
          brokerAccountId: brokerAccount.id,
          securityId: null,
          type,
          timestamp: occurredAt,
          transactionCurrency: currency,
          fxRateToChf,
          fee: type === "FEE" ? totalValue : 0,
          feeChf: type === "FEE" ? totalValue * fxRateToChf : 0,
          totalValue,
          totalValueChf: totalValue * fxRateToChf,
          notes: `Trading 212 ${cash.type.toLowerCase().replaceAll("_", " ")}`,
          importSource: "TRADING212",
          externalId,
          importFingerprint,
        },
      });
      existingExternalIds.add(externalId);
      existingFingerprints.add(importFingerprint);
      imported += 1;
    }

    for (const position of positions) {
      if (await updatePositionQuote(tx, brokerAccount.id, position, accountToChfRate)) quotesUpdated += 1;
      else {
        warnings.push(`${position.instrument.ticker} did not include a usable current price or FX rate.`);
        skipped += 1;
      }
    }
  }, { timeout: 120_000 });

  return {
    accountCurrency,
    fetched: orders.length + dividends.length + cashTransactions.length,
    imported,
    duplicates,
    quotesUpdated,
    skipped,
    warnings: warnings.slice(0, 20),
  };
}
