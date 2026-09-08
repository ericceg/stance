import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(),
  securitySnapshots: vi.fn(), portfolioSnapshots: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/lib/db", () => {
  const tx = {
    transaction: { create: mocks.create, update: mocks.update, findUnique: mocks.findUnique, delete: mocks.delete, deleteMany: mocks.deleteMany },
    securitySnapshot: { deleteMany: mocks.securitySnapshots },
    portfolioSnapshot: { deleteMany: mocks.portfolioSnapshots },
  };
  return { prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/providers/fx", () => ({
  historicalFxKey: () => "CHF", fxRateProvider: { getHistoricalRatesToChf: async () => new Map([["CHF", 1]]) },
}));
import { clearTransactionsAction, createTransactionAction, deleteTransactionAction } from "./actions";
import { updateFeeAmountAction } from "../fees/actions";

beforeEach(() => vi.resetAllMocks());
const date = new Date("2026-09-08T12:00:00Z");
const invalidation = { where: { timestamp: { gte: date } } };

describe("ledger mutation history and validation", () => {
  it("saves a real trade form, invalidates both later histories, and refreshes all views", async () => {
    const data = new FormData();
    Object.entries({ type: "BUY", brokerAccountId: "account", securityId: "security", timestamp: "2026-09-08", quantity: "2", executionPrice: "50", transactionCurrency: "CHF", fee: "1" }).forEach(([key, value]) => data.set(key, value));
    await expect(createTransactionAction({}, data)).rejects.toThrow("REDIRECT");
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ totalValueChf: 100, feeChf: 1 }) });
    expect(mocks.securitySnapshots).toHaveBeenCalledWith(invalidation);
    expect(mocks.portfolioSnapshots).toHaveBeenCalledWith(invalidation);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("deletes both affected histories when deleting a transaction", async () => {
    mocks.findUnique.mockResolvedValue({ timestamp: date });
    await deleteTransactionAction("transaction");
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "transaction" } });
    expect(mocks.securitySnapshots).toHaveBeenCalledWith(invalidation);
    expect(mocks.portfolioSnapshots).toHaveBeenCalledWith(invalidation);
  });
  it("makes repeated deletes harmless", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await deleteTransactionAction("missing");
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.securitySnapshots).not.toHaveBeenCalled();
  });
  it("clears security history as well as portfolio history and the ledger", async () => {
    await clearTransactionsAction();
    expect(mocks.deleteMany).toHaveBeenCalled();
    expect(mocks.securitySnapshots).toHaveBeenCalledWith({ where: {} });
    expect(mocks.portfolioSnapshots).toHaveBeenCalledWith({ where: {} });
  });
  it.each(["", " ", "-1", "Infinity"])("rejects invalid fee '%s' without touching the ledger", async (amount) => {
    const data = new FormData();
    data.set("transactionId", "transaction"); data.set("amount", amount);
    expect(await updateFeeAmountAction({}, data)).toHaveProperty("error");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

it.each(["BUY", "FEE"])("saves an explicit zero %s fee and invalidates affected history", async (type) => {
  mocks.findUnique.mockResolvedValue({ id: "transaction", type, timestamp: date, fxRateToChf: { toNumber: () => 0.8 } });
  const data = new FormData(); data.set("transactionId", "transaction"); data.set("amount", "0");
  expect(await updateFeeAmountAction({}, data)).toEqual({ saved: true });
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "transaction" }, data: type === "FEE"
    ? { totalValue: 0, totalValueChf: 0, fee: 0, feeChf: 0 }
    : { fee: 0, feeChf: 0 } });
  expect(mocks.securitySnapshots).toHaveBeenCalledWith(invalidation);
  expect(mocks.portfolioSnapshots).toHaveBeenCalledWith(invalidation);
});
