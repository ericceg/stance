"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { transactionSchema } from "@/lib/portfolio/transaction-validation";
import { invalidatePortfolioHistory, revalidatePortfolioViews } from "@/lib/portfolio/mutations";
import { fxRateProvider, historicalFxKey } from "@/lib/providers/fx";

export interface TransactionFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function createTransactionAction(
  _previousState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = transactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please correct the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;
  const totalValue = input.type === "BUY" || input.type === "SELL"
    ? input.quantity! * input.executionPrice!
    : input.totalValue!;
  const timestamp = new Date(`${input.timestamp}T12:00:00.000Z`);

  try {
    const rates = await fxRateProvider.getHistoricalRatesToChf([
      { currency: input.transactionCurrency, date: timestamp },
    ]);
    const fxRateToChf = rates.get(historicalFxKey(input.transactionCurrency, timestamp));
    if (!fxRateToChf) throw new Error(`No automatic ${input.transactionCurrency}/CHF rate is available for ${input.timestamp}.`);
    if (!Number.isFinite(totalValue * fxRateToChf) || !Number.isFinite(input.fee * fxRateToChf)) {
      return { error: "The converted amount is too large. Check the transaction values." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          brokerAccountId: input.brokerAccountId,
          securityId: input.securityId || null,
          type: input.type,
          timestamp,
          quantity: input.quantity,
          executionPrice: input.executionPrice,
          transactionCurrency: input.transactionCurrency,
          fxRateToChf,
          fee: input.fee,
          feeChf: input.fee * fxRateToChf,
          totalValue,
          totalValueChf: totalValue * fxRateToChf,
          notes: input.notes || null,
          importSource: "MANUAL",
        },
      });
      await invalidatePortfolioHistory(tx, timestamp);
    });
  } catch (error) {
    console.error("Failed to create transaction", error);
    return { error: error instanceof Error ? error.message : "The transaction could not be saved. No portfolio data was changed." };
  }

  revalidatePortfolioViews();
  redirect("/transactions?created=1");
}

export async function deleteTransactionAction(id: string) {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id } });
    if (!transaction) return;
    await tx.transaction.delete({ where: { id } });
    await invalidatePortfolioHistory(tx, transaction.timestamp);
  });
  revalidatePortfolioViews();
}

export async function clearTransactionsAction() {
  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany();
    await invalidatePortfolioHistory(tx);
  });
  revalidatePortfolioViews();
}
