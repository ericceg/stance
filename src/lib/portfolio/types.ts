export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const ASSET_TYPES = ["ETF", "STOCK", "CASH", "OTHER"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface AccountingTransaction {
  id: string;
  securityId: string | null;
  brokerAccountId: string;
  type: TransactionType;
  timestamp: Date;
  quantity: number | null;
  executionPrice: number | null;
  transactionCurrency: string;
  fxRateToChf: number;
  fee: number;
  feeChf: number;
  totalValue: number;
  totalValueChf: number;
}

export interface SecurityRecord {
  id: string;
  isin: string | null;
  ticker: string;
  name: string;
  assetType: string;
  exchange: string | null;
  tradingCurrency: string;
  marketDataTicker: string | null;
  marketDataProvider: string;
}

export interface BrokerAccountRecord {
  id: string;
  brokerName: string;
  accountName: string;
  baseCurrency: string;
}

export interface QuoteRecord {
  securityId: string;
  price: number;
  previousClose: number | null;
  currency: string;
  fxRateToChf: number;
  provider: string;
  quotedAt: Date;
}

export interface DataIssue {
  code: "MISSING_PRICE" | "MISSING_FX_RATE" | "MISSING_ISIN" | "INVALID_TRANSACTION" | "OVERSOLD_POSITION";
  message: string;
  severity: "warning" | "error";
  securityId?: string;
  transactionId?: string;
}

export interface AccountPosition {
  securityId: string;
  brokerAccountId: string;
  quantity: number;
  costBasisLocal: number;
  costBasisChf: number;
  averageCostLocal: number;
  averageCostChf: number;
  grossPurchasesChf: number;
  realizedPnlChf: number;
  dividendIncomeChf: number;
  feesChf: number;
}

export interface PortfolioPosition extends Omit<AccountPosition, "brokerAccountId"> {
  accountPositions: AccountPosition[];
  security: SecurityRecord;
  quote: QuoteRecord | null;
  currentPrice: number | null;
  currentPriceChf: number | null;
  marketValueChf: number | null;
  todayPnlChf: number | null;
  unrealizedPnlChf: number | null;
  totalPnlChf: number | null;
  returnPercent: number | null;
  portfolioWeight: number | null;
}

export interface PortfolioSummary {
  positions: PortfolioPosition[];
  cashChf: number;
  investedCapitalChf: number;
  marketValueChf: number;
  portfolioValueChf: number;
  netContributionsChf: number;
  realizedPnlChf: number;
  unrealizedPnlChf: number;
  totalPnlChf: number;
  todayPnlChf: number;
  todayReturnPercent: number;
  totalReturnPercent: number;
  issues: DataIssue[];
}
