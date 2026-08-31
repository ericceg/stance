import type { QuoteRecord, SecurityRecord } from "@/lib/portfolio/types";

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
