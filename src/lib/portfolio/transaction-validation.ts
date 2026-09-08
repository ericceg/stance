import { z } from "zod";
import { TRANSACTION_TYPES } from "./types";

const optionalPositiveNumber = z.preprocess(
  (value) => value === "" || value == null ? undefined : Number(value),
  z.number().positive().optional(),
);

export const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  brokerAccountId: z.string().min(1, "Choose a broker account."),
  securityId: z.string().optional(),
  timestamp: z.iso.date("Choose a valid transaction date."),
  quantity: optionalPositiveNumber,
  executionPrice: optionalPositiveNumber,
  totalValue: optionalPositiveNumber,
  transactionCurrency: z.string().trim().regex(/^[a-z]{3}$/i, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
  fee: z.preprocess((value) => value === "" || value == null ? 0 : Number(value), z.number().min(0, "Fee cannot be negative.")),
  notes: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (["BUY", "SELL"].includes(value.type)) {
    if (!value.securityId) context.addIssue({ code: "custom", path: ["securityId"], message: "Choose a security for a buy or sell." });
    if (!value.quantity) context.addIssue({ code: "custom", path: ["quantity"], message: "Enter a quantity." });
    if (value.quantity && value.executionPrice && !Number.isFinite(value.quantity * value.executionPrice)) {
      context.addIssue({ code: "custom", path: ["executionPrice"], message: "The total trade value is too large." });
    }
    if (!value.executionPrice) context.addIssue({ code: "custom", path: ["executionPrice"], message: "Enter an execution price." });
  }
  if (value.type === "DIVIDEND" && !value.securityId) {
    context.addIssue({ code: "custom", path: ["securityId"], message: "Choose the security that paid the dividend." });
  }
  if (!["BUY", "SELL"].includes(value.type) && !value.totalValue) {
    context.addIssue({ code: "custom", path: ["totalValue"], message: "Enter the gross transaction value." });
  }
});
