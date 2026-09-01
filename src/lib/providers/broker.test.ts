import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Trading212Provider } from "./broker";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function provider() {
  vi.stubEnv("TRADING212_API_KEY", "test-key");
  vi.stubEnv("TRADING212_API_SECRET", "test-secret");
  vi.stubEnv("TRADING212_ENVIRONMENT", "demo");
  return new Trading212Provider();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Trading212Provider response compatibility", () => {
  it("accepts nullable informational fields in live position responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{
      instrument: { ticker: "TEST_CH_EQ", name: "Test", isin: "CH0000000001", currency: "CHF" },
      createdAt: "2026-01-01T00:00:00Z",
      quantity: 2,
      quantityAvailableForTrading: 2,
      quantityInPies: 0,
      currentPrice: 50,
      averagePricePaid: 45,
      walletImpact: {
        currency: "CHF",
        totalCost: 90,
        currentValue: 100,
        unrealizedProfitLoss: 10,
        fxImpact: null,
      },
    }])));

    await expect(provider().getOpenPositions()).resolves.toMatchObject([{
      instrument: { ticker: "TEST_CH_EQ" },
      quantity: 2,
      currentPrice: 50,
    }]);
  });

  it("accepts cancelled or unfilled history orders without a fill object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        order: {
          id: 123,
          instrument: { ticker: "TEST_CH_EQ", name: "Test", isin: "CH0000000001", currency: "CHF" },
          side: "BUY",
          status: "CANCELLED",
        },
      }],
      nextPagePath: null,
    })));

    const orders = await provider().getHistoricalOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].fill).toBeUndefined();
  });
});
