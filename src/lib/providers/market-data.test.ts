import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SecurityRecord } from "@/lib/portfolio/types";
import { YahooFinanceMarketDataProvider } from "./market-data";

const security: SecurityRecord = {
  id: "security-a",
  isin: "CH0237935637",
  ticker: "CH0237935637",
  name: "iShares Swiss Dividend ETF (CH)",
  assetType: "ETF",
  exchange: null,
  tradingCurrency: "CHF",
  marketDataTicker: null,
  marketDataProvider: "DEGIRO",
};

afterEach(() => vi.unstubAllGlobals());

describe("YahooFinanceMarketDataProvider", () => {
  it("resolves an imported ISIN and returns a CHF-valued quote", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [{ symbol: "CHDVD.SW", quoteType: "ETF", isYahooFinance: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: {
          currency: "CHF",
          regularMarketPrice: 191.88,
          previousClose: 190.38,
          regularMarketTime: 1_788_276_915,
        } }] },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const rateProvider = { getCurrentRateToChf: vi.fn().mockResolvedValue(1) };

    const result = await new YahooFinanceMarketDataProvider(rateProvider).getResolvedQuote(security);

    expect(result).toMatchObject({
      symbol: "CHDVD.SW",
      quote: { currency: "CHF", price: 191.88, previousClose: 190.38, provider: "YAHOO" },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=CH0237935637");
    expect(rateProvider.getCurrentRateToChf).toHaveBeenCalledWith("CHF");
  });

  it("normalizes London pence quotes before CHF conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      chart: { result: [{ meta: { currency: "GBp", regularMarketPrice: 5_432, chartPreviousClose: 5_400 } }] },
    }))));
    const rateProvider = { getCurrentRateToChf: vi.fn().mockResolvedValue(1.05) };

    const result = await new YahooFinanceMarketDataProvider(rateProvider)
      .getResolvedQuote({ ...security, marketDataTicker: "TEST.L" });

    expect(result?.quote).toMatchObject({ currency: "GBP", price: 54.32, previousClose: 54 });
    expect(rateProvider.getCurrentRateToChf).toHaveBeenCalledWith("GBP");
  });
});
