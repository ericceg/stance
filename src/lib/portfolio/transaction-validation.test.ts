import { describe, expect, it } from "vitest";
import { transactionSchema } from "./transaction-validation";

const common = { brokerAccountId: "account", timestamp: "2026-09-08", transactionCurrency: "chf", fee: "0" };

describe("manual transaction validation", () => {
  it.each(["BUY", "SELL"])("accepts %s without the hidden cash-value field", (type) => {
    expect(transactionSchema.parse({ ...common, type, securityId: "security", quantity: "2", executionPrice: "50" }))
      .toMatchObject({ quantity: 2, executionPrice: 50, transactionCurrency: "CHF" });
  });
  it.each(["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "FEE"])("accepts %s without hidden trade fields", (type) => {
    expect(transactionSchema.parse({ ...common, type, securityId: "security", totalValue: "100" }))
      .toMatchObject({ totalValue: 100 });
  });
  it.each(["", "2026-02-30", "not-a-date", "2026-09-08T12:00:00Z"])("rejects invalid date %s", (timestamp) => {
    const result = transactionSchema.safeParse({ ...common, type: "DEPOSIT", totalValue: "100", timestamp });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.timestamp).toBeDefined();
  });
  it("still requires trade fields and rejects overflowing totals", () => {
    expect(transactionSchema.safeParse({ ...common, type: "BUY" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...common, type: "BUY", securityId: "security", quantity: "1e300", executionPrice: "1e300" }).success).toBe(false);
  });
  it("rejects non-letter currencies and negative fees", () => {
    expect(transactionSchema.safeParse({ ...common, type: "DEPOSIT", totalValue: "100", transactionCurrency: "123" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...common, type: "DEPOSIT", totalValue: "100", fee: "-1" }).success).toBe(false);
  });
});
