import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FrankfurterFxProvider, historicalFxKey } from "./fx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FrankfurterFxProvider", () => {
  it("returns CHF parity without making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new FrankfurterFxProvider().getCurrentRateToChf("chf")).resolves.toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the current CHF quote automatically", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      date: "2026-09-01",
      base: "USD",
      quote: "CHF",
      rate: 0.80743,
    }))));

    await expect(new FrankfurterFxProvider().getCurrentRateToChf("USD")).resolves.toBe(0.80743);
  });

  it("batches historical dates by currency and uses the latest available prior observation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { date: "2026-01-02", base: "EUR", quote: "CHF", rate: 0.93 },
      { date: "2026-01-05", base: "EUR", quote: "CHF", rate: 0.94 },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FrankfurterFxProvider();

    const rates = await provider.getHistoricalRatesToChf([
      { currency: "EUR", date: "2026-01-03" },
      { currency: "EUR", date: "2026-01-05" },
      { currency: "CHF", date: "2026-01-05" },
    ]);

    expect(rates.get(historicalFxKey("EUR", "2026-01-03"))).toBe(0.93);
    expect(rates.get(historicalFxKey("EUR", "2026-01-05"))).toBe(0.94);
    expect(rates.get(historicalFxKey("CHF", "2026-01-05"))).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("base=EUR");
  });

  it("reports automatic lookup failures without offering a manual fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));

    await expect(new FrankfurterFxProvider().getCurrentRateToChf("GBP"))
      .rejects.toThrow("automatic FX service returned HTTP 503");
  });
});
