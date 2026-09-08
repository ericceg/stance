"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

export interface FeeAmountFormState {
  error?: string;
  saved?: boolean;
}

const feeAmountSchema = z.object({
  transactionId: z.string().min(1),
  amount: z.coerce.number().finite().min(0, "Enter a fee of zero or more."),
});

export async function updateFeeAmountAction(
  _previousState: FeeAmountFormState,
  formData: FormData,
): Promise<FeeAmountFormState> {
  const parsed = feeAmountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid fee." };

  const transaction = await prisma.transaction.findUnique({ where: { id: parsed.data.transactionId } });
  if (!transaction) return { error: "That transaction is no longer available." };

  const amountChf = parsed.data.amount * transaction.fxRateToChf.toNumber();
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: transaction.type === "FEE"
      ? { totalValue: parsed.data.amount, totalValueChf: amountChf, fee: parsed.data.amount, feeChf: amountChf }
      : { fee: parsed.data.amount, feeChf: amountChf },
  });

  revalidatePath("/");
  revalidatePath("/fees");
  revalidatePath("/transactions");
  revalidatePath("/breakdown");
  if (transaction.securityId) revalidatePath(`/holdings/${transaction.securityId}`);
  return { saved: true };
}
