import { z } from "zod";
import type { QuoteRecord, SecurityRecord } from "../portfolio/types";
import { fxRateProvider } from "./fx";

const YAHOO_API_URL = "https://query2.finance.yahoo.com";
const yahooSearchSchema = z.object({
  quotes: z.array(z.object({
    currency: z.string().optional(),
    isYahooFinance: z.boolean().optional(),
    quoteType: z.string().optional(),
    symbol: z.string().min(1),
  })),
});
const yahooChartSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      meta: z.object({
        chartPreviousClose: z.number().positive().optional(),
        currency: z.string().min(3),
        previousClose: z.number().positive().optional(),
        regularMarketPrice: z.number().positive(),
        regularMarketTime: z.number().optional(),
      }),
    })).nullable(),
  }),
});

async function fetchYahooJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 PersPort/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo Finance returned HTTP ${response.status}.`);
  return response.json();
}

function yahooCurrency(currency: string) {
  return currency === "GBp" ? { code: "GBP", scale: 0.01 } : { code: currency.toUpperCase(), scale: 1 };
}

export interface HistoricalPrice {
  timestamp: Date;
  price: number;
  currency: string;
}

export interface HistoricalRange {
  from: Date;
  to: Date;
  interval: "DAY" | "WEEK" | "MONTH";
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(security: SecurityRecord): Promise<QuoteRecord | null>;
  getQuotes(securities: SecurityRecord[]): Promise<QuoteRecord[]>;
  getHistoricalPrices(security: SecurityRecord, range: HistoricalRange): Promise<HistoricalPrice[]>;
  getFxRate(fromCurrency: string, toCurrency: string): Promise<number | null>;
}

export interface ResolvedYahooQuote {
  quote: QuoteRecord;
  symbol: string;
}

/** Current market quotes resolved by canonical ISIN through Yahoo Finance. */
export class YahooFinanceMarketDataProvider implements MarketDataProvider {
  readonly name = "YAHOO";

  constructor(private readonly rateProvider: Pick<typeof fxRateProvider, "getCurrentRateToChf"> = fxRateProvider) {}

  private async searchSymbols(security: SecurityRecord) {
    const queries = [...new Set([security.isin ?? security.ticker, security.name])];
    const responses = await Promise.all(queries.map(async (query) => {
      const url = new URL("/v1/finance/search", YAHOO_API_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("quotesCount", "20");
      url.searchParams.set("newsCount", "0");
      const parsed = yahooSearchSchema.safeParse(await fetchYahooJson(url));
      if (!parsed.success) throw new Error("Yahoo Finance returned an invalid symbol search response.");
      return parsed.data.quotes;
    }));
    const candidates = responses.flat().filter((item, index, items) => (
      item.isYahooFinance !== false
      && ["EQUITY", "ETF", "MUTUALFUND"].includes(item.quoteType ?? "")
      && items.findIndex((candidate) => candidate.symbol === item.symbol) === index
    ));
    return candidates.sort((left, right) => {
      const leftMatches = left.currency && yahooCurrency(left.currency).code === security.tradingCurrency;
      const rightMatches = right.currency && yahooCurrency(right.currency).code === security.tradingCurrency;
      return Number(rightMatches) - Number(leftMatches);
    }).map((item) => item.symbol);
  }

  private async fetchResolvedQuote(securityId: string, symbol: string): Promise<ResolvedYahooQuote> {
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, YAHOO_API_URL);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    const parsed = yahooChartSchema.safeParse(await fetchYahooJson(url));
    const result = parsed.success ? parsed.data.chart.result?.[0] : null;
    if (!result) throw new Error(`Yahoo Finance returned no current quote for ${symbol}.`);
    const currency = yahooCurrency(result.meta.currency);
    const fxRateToChf = await this.rateProvider.getCurrentRateToChf(currency.code);
    const rawPreviousClose = result.meta.previousClose ?? result.meta.chartPreviousClose ?? null;
    return {
      symbol,
      quote: {
        securityId,
        price: result.meta.regularMarketPrice * currency.scale,
        previousClose: rawPreviousClose === null ? null : rawPreviousClose * currency.scale,
        currency: currency.code,
        fxRateToChf,
        provider: this.name,
        quotedAt: result.meta.regularMarketTime ? new Date(result.meta.regularMarketTime * 1_000) : new Date(),
      },
    };
  }

  async getResolvedQuote(security: SecurityRecord): Promise<ResolvedYahooQuote | null> {
    let fallback: ResolvedYahooQuote | null = null;
    if (security.marketDataTicker) {
      fallback = await this.fetchResolvedQuote(security.id, security.marketDataTicker);
      if (fallback.quote.currency === security.tradingCurrency) return fallback;
    }

    const symbols = await this.searchSymbols(security);
    for (const symbol of symbols) {
      if (symbol === security.marketDataTicker) continue;
      try {
        const resolved = await this.fetchResolvedQuote(security.id, symbol);
        if (!fallback) fallback = resolved;
        if (resolved.quote.currency === security.tradingCurrency) return resolved;
      } catch {
        // A stale search result must not prevent another listing from being tried.
      }
    }
    return fallback;
  }

  async getQuote(security: SecurityRecord) {
    return (await this.getResolvedQuote(security))?.quote ?? null;
  }

  async getQuotes(securities: SecurityRecord[]) {
    const results = await Promise.all(securities.map((security) => this.getQuote(security)));
    return results.filter((quote): quote is QuoteRecord => quote !== null);
  }

  async getHistoricalPrices() {
    return [];
  }

  async getFxRate(fromCurrency: string, toCurrency: string) {
    if (fromCurrency === toCurrency) return 1;
    if (toCurrency !== "CHF") return null;
    return this.rateProvider.getCurrentRateToChf(fromCurrency);
  }
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "MOCK";

  constructor(private readonly quotes: QuoteRecord[]) {}

  async getQuote(security: SecurityRecord) {
    return this.quotes.find((quote) => quote.securityId === security.id) ?? null;
  }

  async getQuotes(securities: SecurityRecord[]) {
    const requestedIds = new Set(securities.map((security) => security.id));
    return this.quotes.filter((quote) => requestedIds.has(quote.securityId));
  }

  async getHistoricalPrices() {
    return [];
  }

  async getFxRate(fromCurrency: string, toCurrency: string) {
    if (fromCurrency === toCurrency) return 1;
    if (toCurrency !== "CHF") return null;
    return this.quotes.find((quote) => quote.currency === fromCurrency)?.fxRateToChf ?? null;
  }
}
