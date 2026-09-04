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
      .getResolvedQuote({ ...security, tradingCurrency: "GBP", marketDataTicker: "TEST.L" });

    expect(result?.quote).toMatchObject({ currency: "GBP", price: 54.32, previousClose: 54 });
    expect(rateProvider.getCurrentRateToChf).toHaveBeenCalledWith("GBP");
  });

  it("replaces a cached quote with a listing in the imported trading currency", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "GBp", regularMarketPrice: 3_215 } }] },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [
          { symbol: "EIMI.L", currency: "GBp", quoteType: "ETF", isYahooFinance: true },
          { symbol: "EIMI.DE", currency: "EUR", quoteType: "ETF", isYahooFinance: true },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [
          { symbol: "EIMI.L", currency: "GBp", quoteType: "ETF", isYahooFinance: true },
          { symbol: "EIMI.DE", currency: "EUR", quoteType: "ETF", isYahooFinance: true },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "EUR", regularMarketPrice: 47.746 } }] },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const rateProvider = { getCurrentRateToChf: vi.fn().mockImplementation(async (currency: string) => currency === "EUR" ? 0.94 : 1.06) };

    const result = await new YahooFinanceMarketDataProvider(rateProvider).getResolvedQuote({
      ...security,
      isin: "IE00BKM4GZ66",
      ticker: "EIMI",
      tradingCurrency: "EUR",
      marketDataTicker: "EIMI.L",
    });

    expect(result).toMatchObject({ symbol: "EIMI.DE", quote: { currency: "EUR", price: 47.746 } });
  });

  it("loads daily closes for the resolved trading listing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "CHF", regularMarketPrice: 102 } }] },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{
          meta: { currency: "CHF" },
          timestamp: [1_788_220_800, 1_788_307_200],
          indicators: { quote: [{ close: [100, 101.5] }] },
        }] },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const rateProvider = { getCurrentRateToChf: vi.fn().mockResolvedValue(1) };

    const result = await new YahooFinanceMarketDataProvider(rateProvider).getHistoricalPrices(
      { ...security, marketDataTicker: "TEST.SW" },
      { from: new Date("2026-08-31T00:00:00Z"), to: new Date("2026-09-02T00:00:00Z"), interval: "DAY" },
    );

    expect(result).toEqual([
      { timestamp: new Date(1_788_220_800_000), price: 100, currency: "CHF" },
      { timestamp: new Date(1_788_307_200_000), price: 101.5, currency: "CHF" },
    ]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("interval=1d");
  });

  it("uses another listing of the same security when the preferred listing has no history", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "EUR", regularMarketPrice: 4.35 } }] },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "EUR" }, timestamp: [], indicators: { quote: [{ close: [] }] } }] },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [{ symbol: "VALL.L", quoteType: "ETF", isYahooFinance: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quotes: [{ symbol: "VALL.L", quoteType: "ETF", isYahooFinance: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: { result: [{ meta: { currency: "GBP" }, timestamp: [1_788_220_800], indicators: { quote: [{ close: [3.72] }] } }] },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const rateProvider = { getCurrentRateToChf: vi.fn().mockResolvedValue(0.94) };

    const result = await new YahooFinanceMarketDataProvider(rateProvider).getHistoricalPrices(
      { ...security, isin: "IE000VAHT5T0", tradingCurrency: "EUR", marketDataTicker: "IE000VAHT5T0.SG" },
      { from: new Date("2026-08-31T00:00:00Z"), to: new Date("2026-09-02T00:00:00Z"), interval: "DAY" },
    );

    expect(result).toEqual([{ timestamp: new Date(1_788_220_800_000), price: 3.72, currency: "GBP" }]);
  });
});
