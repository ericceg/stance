import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importCsv: vi.fn(), sync: vi.fn(), quotes: vi.fn(), history: vi.fn(), revalidate: vi.fn(),
  securitySnapshots: vi.fn(), portfolioSnapshots: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({
  securitySnapshot: { deleteMany: mocks.securitySnapshots }, portfolioSnapshot: { deleteMany: mocks.portfolioSnapshots },
}) } }));
vi.mock("@/lib/import/degiro-import", () => ({ importDegiroCsv: mocks.importCsv }));
vi.mock("@/lib/import/trading212-sync", () => ({ syncTrading212: mocks.sync }));
vi.mock("@/lib/portfolio/market-data-sync", () => ({ refreshOpenPositionQuotes: mocks.quotes }));
vi.mock("@/lib/portfolio/history-rebuild", () => ({ rebuildPortfolioHistory: mocks.history }));
vi.mock("@/lib/portfolio/regional-exposure", () => ({ refreshRegionalExposures: async () => ({ warnings: [] }) }));
vi.mock("@/lib/portfolio/underlying-holdings", () => ({ refreshUnderlyingHoldings: async () => ({ warnings: [] }) }));
import { importDegiroAction, syncTrading212Action } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.importCsv.mockResolvedValue({ imported: 1, quotesUpdated: 0, warnings: [] });
  mocks.sync.mockResolvedValue({ imported: 1, quotesUpdated: 2, warnings: [] });
  mocks.history.mockResolvedValue({ warnings: [] });
});

it.each(["DEGIRO", "Trading 212"])("reports saved %s records when post-import quotes fail", async (broker) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.quotes.mockRejectedValue(new Error("offline"));
    const data = new FormData();
    data.set("brokerAccountId", "account"); data.set("statement", new File(["test"], "test.csv"));
    const result = broker === "DEGIRO" ? await importDegiroAction({}, data) : await syncTrading212Action({}, data);
    expect(result.error).toBeUndefined();
    expect(result.report?.imported).toBe(1);
    expect(result.report?.warnings[0]).toContain("current prices could not be refreshed");
    expect(mocks.history).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  } finally { log.mockRestore(); }
});

it("clears both stale histories when reconstruction fails after import", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.quotes.mockResolvedValue({ updated: 0, warnings: [] });
    mocks.history.mockRejectedValue(new Error("offline"));
    const result = await syncTrading212Action({}, new FormData());
    expect(result.report?.warnings[0]).toContain("Historical performance could not be rebuilt");
    expect(mocks.securitySnapshots).toHaveBeenCalledWith({ where: {} });
    expect(mocks.portfolioSnapshots).toHaveBeenCalledWith({ where: {} });
  } finally { log.mockRestore(); }
});
