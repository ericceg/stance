"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TRANSACTION_TYPES } from "@/lib/portfolio/types";

export interface TransactionFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const optionalPositiveNumber = z.preprocess(
  (value) => value === "" || value === null ? undefined : Number(value),
  z.number().positive().optional(),
);

const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  brokerAccountId: z.string().min(1, "Choose a broker account."),
  securityId: z.string().optional(),
  timestamp: z.string().min(1, "Choose a transaction date."),
  quantity: optionalPositiveNumber,
  executionPrice: optionalPositiveNumber,
  totalValue: optionalPositiveNumber,
  transactionCurrency: z.string().trim().length(3, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
  fxRateToChf: z.preprocess((value) => Number(value), z.number().positive("FX rate must be positive.")),
  fee: z.preprocess((value) => value === "" ? 0 : Number(value), z.number().min(0, "Fee cannot be negative.")),
  notes: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (["BUY", "SELL"].includes(value.type)) {
    if (!value.securityId) context.addIssue({ code: "custom", path: ["securityId"], message: "Choose a security for a buy or sell." });
    if (!value.quantity) context.addIssue({ code: "custom", path: ["quantity"], message: "Enter a quantity." });
    if (!value.executionPrice) context.addIssue({ code: "custom", path: ["executionPrice"], message: "Enter an execution price." });
  }
  if (value.type === "DIVIDEND" && !value.securityId) {
    context.addIssue({ code: "custom", path: ["securityId"], message: "Choose the security that paid the dividend." });
  }
  if (!["BUY", "SELL"].includes(value.type) && !value.totalValue) {
    context.addIssue({ code: "custom", path: ["totalValue"], message: "Enter the gross transaction value." });
  }
});

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

  try {
    await prisma.transaction.create({
      data: {
        brokerAccountId: input.brokerAccountId,
        securityId: input.securityId || null,
        type: input.type,
        timestamp: new Date(`${input.timestamp}T12:00:00.000Z`),
        quantity: input.quantity,
        executionPrice: input.executionPrice,
        transactionCurrency: input.transactionCurrency,
        fxRateToChf: input.fxRateToChf,
        fee: input.fee,
        feeChf: input.fee * input.fxRateToChf,
        totalValue,
        totalValueChf: totalValue * input.fxRateToChf,
        notes: input.notes || null,
        importSource: "MANUAL",
      },
    });
  } catch (error) {
    console.error("Failed to create transaction", error);
    return { error: "The transaction could not be saved. No portfolio data was changed." };
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  redirect("/transactions?created=1");
}

export async function deleteTransactionAction(id: string) {
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/transactions");
}

export async function clearTransactionsAction() {
  await prisma.transaction.deleteMany();
  revalidatePath("/");
  revalidatePath("/transactions");
}
