import "server-only";

import { z } from "zod";

export interface BrokerAccountSnapshot {
  externalAccountId: string;
  baseCurrency: string;
}

export interface BrokerCashBalance {
  currency: string;
  amount: number;
}

export interface BrokerPositionRecord {
  externalSecurityId?: string;
  isin?: string;
  ticker?: string;
  quantity: number;
}

export interface BrokerTransactionRecord {
  externalId: string;
  occurredAt: Date;
  type: string;
  isin?: string;
  ticker?: string;
  quantity?: number;
  price?: number;
  currency: string;
  fee?: number;
  totalValue: number;
}

export interface BrokerDividendRecord extends BrokerTransactionRecord {
  type: "DIVIDEND";
}

/** Read-only by design. Trade placement is intentionally absent from this contract. */
export interface BrokerProvider {
  readonly name: string;
  getAccount(): Promise<BrokerAccountSnapshot>;
  getCash(): Promise<BrokerCashBalance[]>;
  getPositions(): Promise<BrokerPositionRecord[]>;
  getTransactions(): Promise<BrokerTransactionRecord[]>;
  getDividends(): Promise<BrokerDividendRecord[]>;
}

const instrumentSchema = z.object({
  currency: z.string().length(3),
  isin: z.string().nullable().optional(),
  name: z.string(),
  ticker: z.string(),
  type: z.string().optional(),
});

const accountSummarySchema = z.object({
  cash: z.object({ availableToTrade: z.number() }),
  currency: z.string().length(3),
  id: z.union([z.number(), z.string()]),
  investments: z.object({
    currentValue: z.number(),
    realizedProfitLoss: z.number(),
    totalCost: z.number(),
    unrealizedProfitLoss: z.number(),
  }),
  totalValue: z.number(),
});

const positionSchema = z.object({
  currentPrice: z.number(),
  instrument: instrumentSchema,
  quantity: z.number(),
  walletImpact: z.object({
    currency: z.string().length(3),
    currentValue: z.number(),
  }),
});

const historicalOrderSchema = z.object({
  fill: z.object({
    filledAt: z.string(),
    id: z.union([z.number(), z.string()]),
    price: z.number(),
    quantity: z.number(),
    type: z.string(),
    walletImpact: z.object({
      currency: z.string().length(3),
      fxRate: z.number().nullable().optional(),
      netValue: z.number(),
      taxes: z.array(z.object({
        chargedAt: z.string().optional(),
        currency: z.string().length(3),
        name: z.string(),
        quantity: z.number(),
      })).optional().default([]),
    }),
  }).nullish(),
  order: z.object({
    id: z.union([z.number(), z.string()]),
    instrument: instrumentSchema,
    side: z.enum(["BUY", "SELL"]),
  }),
});

const dividendSchema = z.object({
  amount: z.number(),
  currency: z.string().length(3),
  instrument: instrumentSchema,
  paidOn: z.string(),
  reference: z.string(),
  type: z.string(),
});

const cashTransactionSchema = z.object({
  amount: z.number(),
  currency: z.string().length(3),
  dateTime: z.string(),
  reference: z.string(),
  type: z.enum(["WITHDRAW", "DEPOSIT", "FEE", "TRANSFER", "INTEREST_ON_FREE_CASH", "LENDING_INTEREST"]),
});

const pageSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  nextPagePath: z.string().nullable().optional(),
});

export type Trading212AccountSummary = z.infer<typeof accountSummarySchema>;
export type Trading212Position = z.infer<typeof positionSchema>;
export type Trading212HistoricalOrder = z.infer<typeof historicalOrderSchema>;
export type Trading212Dividend = z.infer<typeof dividendSchema>;
export type Trading212CashTransaction = z.infer<typeof cashTransactionSchema>;

export class Trading212ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "Trading212ApiError";
  }
}

function trading212Configuration() {
  const apiKey = process.env.TRADING212_API_KEY?.trim();
  const apiSecret = process.env.TRADING212_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Trading212ApiError("Add TRADING212_API_KEY and TRADING212_API_SECRET to .env, then restart the app.");
  }
  const environment = process.env.TRADING212_ENVIRONMENT?.trim().toLowerCase() || "live";
  if (environment !== "live" && environment !== "demo") {
    throw new Trading212ApiError("TRADING212_ENVIRONMENT must be either live or demo.");
  }
  return {
    apiKey,
    apiSecret,
    baseUrl: environment === "demo"
      ? "https://demo.trading212.com/api/v0"
      : "https://live.trading212.com/api/v0",
  };
}

export class Trading212Provider implements BrokerProvider {
  readonly name = "Trading 212";
  private readonly configuration = trading212Configuration();

  private resolveUrl(path: string) {
    const base = new URL(this.configuration.baseUrl);
    const url = path.startsWith("/api/v0/")
      ? new URL(path, base.origin)
      : new URL(path.replace(/^\//, ""), `${this.configuration.baseUrl}/`);
    if (url.origin !== base.origin || !url.pathname.startsWith("/api/v0/")) {
      throw new Trading212ApiError("Trading 212 returned an unsafe pagination URL.");
    }
    return url;
  }

  private async request(path: string): Promise<unknown> {
    const url = this.resolveUrl(path);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${this.configuration.apiKey}:${this.configuration.apiSecret}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        throw new Trading212ApiError(error instanceof Error && error.name === "TimeoutError"
          ? "Trading 212 did not respond within 30 seconds."
          : "Could not reach Trading 212. Check the network connection and try again.");
      }

      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const resetAt = Number(response.headers.get("x-ratelimit-reset"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : Number.isFinite(resetAt) && resetAt > 0
            ? resetAt * 1_000 - Date.now()
            : 10_000;
        await new Promise((resolve) => setTimeout(resolve, Math.min(59_000, Math.max(1_000, waitMs + 250))));
        continue;
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        if (response.status === 401 || response.status === 403) {
          throw new Trading212ApiError("Trading 212 rejected the credentials or their read permissions. Create a read-only key with account, portfolio, and history access.", response.status);
        }
        if (response.status === 429) {
          throw new Trading212ApiError("Trading 212's history rate limit remained active after automatic retries. Wait one minute, then sync again.", response.status);
        }
        throw new Trading212ApiError(`Trading 212 returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`, response.status);
      }
      return response.json();
    }
    throw new Trading212ApiError("Trading 212 did not return a response after automatic retries.");
  }

  private async getAllPages<T>(path: string, item: z.ZodType<T>): Promise<T[]> {
    const schema = pageSchema(item);
    const items: T[] = [];
    let nextPath: string | null = path;
    let pageCount = 0;
    while (nextPath) {
      if (pageCount >= 100) throw new Trading212ApiError("Trading 212 history exceeded the 5,000-record safety limit.");
      const parsed = schema.safeParse(await this.request(nextPath));
      if (!parsed.success) {
        const issueSummary = parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
          .join("; ");
        throw new Trading212ApiError(`Trading 212 returned an unexpected ${path.split("?")[0]} response (${issueSummary}).`);
      }
      items.push(...parsed.data.items);
      nextPath = parsed.data.nextPagePath ?? null;
      pageCount += 1;
    }
    return items;
  }

  async getAccountSummary() {
    const parsed = accountSummarySchema.safeParse(await this.request("equity/account/summary"));
    if (!parsed.success) throw new Trading212ApiError("Trading 212 returned an unexpected account response.");
    return parsed.data;
  }

  async getOpenPositions() {
    const parsed = z.array(positionSchema).safeParse(await this.request("equity/positions"));
    if (!parsed.success) throw new Trading212ApiError("Trading 212 returned an unexpected positions response.");
    return parsed.data;
  }

  getHistoricalOrders() {
    return this.getAllPages("equity/history/orders?limit=50", historicalOrderSchema);
  }

  getPaidDividends() {
    return this.getAllPages("equity/history/dividends?limit=50", dividendSchema);
  }

  getCashHistory() {
    return this.getAllPages("equity/history/transactions?limit=50", cashTransactionSchema);
  }

  async getAccount(): Promise<BrokerAccountSnapshot> {
    const account = await this.getAccountSummary();
    return { externalAccountId: String(account.id), baseCurrency: account.currency };
  }

  async getCash(): Promise<BrokerCashBalance[]> {
    const account = await this.getAccountSummary();
    return [{ currency: account.currency, amount: account.cash.availableToTrade }];
  }

  async getPositions(): Promise<BrokerPositionRecord[]> {
    const positions = await this.getOpenPositions();
    return positions.map((position) => ({
      externalSecurityId: position.instrument.ticker,
      isin: position.instrument.isin ?? undefined,
      ticker: position.instrument.ticker,
      quantity: position.quantity,
    }));
  }

  async getTransactions(): Promise<BrokerTransactionRecord[]> {
    const transactions = await this.getCashHistory();
    return transactions.map((transaction) => ({
      externalId: transaction.reference,
      occurredAt: new Date(transaction.dateTime),
      type: transaction.type,
      currency: transaction.currency,
      totalValue: Math.abs(transaction.amount),
    }));
  }

  async getDividends(): Promise<BrokerDividendRecord[]> {
    const dividends = await this.getPaidDividends();
    return dividends.map((dividend) => ({
      externalId: dividend.reference,
      occurredAt: new Date(dividend.paidOn),
      type: "DIVIDEND",
      isin: dividend.instrument.isin ?? undefined,
      ticker: dividend.instrument.ticker,
      currency: dividend.currency,
      totalValue: Math.abs(dividend.amount),
    }));
  }
}

export class MockTrading212Provider implements BrokerProvider {
  readonly name = "Trading 212 (mock)";

  async getAccount(): Promise<BrokerAccountSnapshot> {
    return { externalAccountId: "fictional-demo-account", baseCurrency: "CHF" };
  }

  async getCash() { return [{ currency: "CHF", amount: 0 }]; }
  async getPositions() { return []; }
  async getTransactions() { return []; }
  async getDividends() { return []; }
}
