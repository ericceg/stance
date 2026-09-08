"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalidatePortfolioHistory, revalidatePortfolioViews } from "@/lib/portfolio/mutations";

export interface FeeAmountFormState {
  error?: string;
  saved?: boolean;
}

const feeAmountSchema = z.object({
  transactionId: z.string().min(1),
  amount: z.string().trim().min(1, "Enter a fee amount; use 0 to remove the fee.").transform(Number).pipe(z.number().finite().min(0, "Enter a fee of zero or more.")),
});

export async function updateFeeAmountAction(
  _previousState: FeeAmountFormState,
  formData: FormData,
): Promise<FeeAmountFormState> {
  const parsed = feeAmountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid fee." };

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id: parsed.data.transactionId } });
      if (!transaction) return false;
      const amountChf = parsed.data.amount * transaction.fxRateToChf.toNumber();
      if (!Number.isFinite(amountChf)) throw new Error("Converted fee is too large.");
      await tx.transaction.update({
        where: { id: transaction.id },
        data: transaction.type === "FEE"
          ? { totalValue: parsed.data.amount, totalValueChf: amountChf, fee: parsed.data.amount, feeChf: amountChf }
          : { fee: parsed.data.amount, feeChf: amountChf },
      });
      await invalidatePortfolioHistory(tx, transaction.timestamp);
      return true;
    });
    if (!saved) return { error: "That transaction is no longer available." };
  } catch (error) {
    console.error("Failed to update fee", error);
    return { error: "The fee could not be saved. Please try again." };
  }
  revalidatePortfolioViews();
  return { saved: true };
}
