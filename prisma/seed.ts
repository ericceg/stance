import { PrismaClient } from "@prisma/client";
import { calculatePortfolio } from "../src/lib/portfolio/accounting";
import type { AccountingTransaction, TransactionType } from "../src/lib/portfolio/types";

const prisma = new PrismaClient();

const ids = {
  trading212: "account_trading212_demo",
  degiro: "account_degiro_demo",
  vwce: "security_vwce_demo",
  nesn: "security_nesn_demo",
  on: "security_on_demo",
  eimi: "security_eimi_demo",
};

interface SeedTransaction {
  id: string;
  accountId: string;
  securityId?: string;
  type: TransactionType;
  timestamp: string;
  quantity?: number;
  price?: number;
  currency: string;
  fxRate: number;
  fee?: number;
  total: number;
  notes?: string;
}

const transactions: SeedTransaction[] = [
  { id: "tx_t212_deposit", accountId: ids.trading212, type: "DEPOSIT", timestamp: "2025-01-09T09:00:00Z", currency: "CHF", fxRate: 1, total: 24_000, notes: "Fictional opening contribution" },
  { id: "tx_nesn_buy_1", accountId: ids.trading212, securityId: ids.nesn, type: "BUY", timestamp: "2025-01-10T10:15:00Z", quantity: 100, price: 82, currency: "CHF", fxRate: 1, fee: 2.5, total: 8_200 },
  { id: "tx_on_buy_1", accountId: ids.trading212, securityId: ids.on, type: "BUY", timestamp: "2025-02-04T15:45:00Z", quantity: 200, price: 45, currency: "USD", fxRate: 0.84, fee: 1.5, total: 9_000 },
  { id: "tx_nesn_buy_2", accountId: ids.trading212, securityId: ids.nesn, type: "BUY", timestamp: "2025-04-16T11:05:00Z", quantity: 50, price: 80, currency: "CHF", fxRate: 1, fee: 2.5, total: 4_000 },
  { id: "tx_on_buy_2", accountId: ids.trading212, securityId: ids.on, type: "BUY", timestamp: "2025-06-11T14:30:00Z", quantity: 50, price: 50, currency: "USD", fxRate: 0.82, fee: 1, total: 2_500 },
  { id: "tx_nesn_sell", accountId: ids.trading212, securityId: ids.nesn, type: "SELL", timestamp: "2026-02-18T10:20:00Z", quantity: 30, price: 86, currency: "CHF", fxRate: 1, fee: 2.5, total: 2_580, notes: "Fictional partial sale" },
  { id: "tx_on_dividend", accountId: ids.trading212, securityId: ids.on, type: "DIVIDEND", timestamp: "2026-05-21T08:00:00Z", currency: "USD", fxRate: 0.81, total: 30 },
  { id: "tx_t212_fee", accountId: ids.trading212, type: "FEE", timestamp: "2026-06-01T08:00:00Z", currency: "CHF", fxRate: 1, total: 8, notes: "Fictional account fee" },

  { id: "tx_degiro_deposit", accountId: ids.degiro, type: "DEPOSIT", timestamp: "2025-01-15T09:00:00Z", currency: "EUR", fxRate: 0.94, total: 30_000, notes: "Fictional opening contribution" },
  { id: "tx_vwce_buy_1", accountId: ids.degiro, securityId: ids.vwce, type: "BUY", timestamp: "2025-01-17T12:15:00Z", quantity: 110, price: 100.5, currency: "EUR", fxRate: 1.02, fee: 3, total: 11_055 },
  { id: "tx_eimi_buy", accountId: ids.degiro, securityId: ids.eimi, type: "BUY", timestamp: "2025-03-12T10:40:00Z", quantity: 150, price: 25, currency: "GBP", fxRate: 1.12, fee: 3.5, total: 3_750 },
  { id: "tx_vwce_buy_2", accountId: ids.degiro, securityId: ids.vwce, type: "BUY", timestamp: "2025-07-09T13:10:00Z", quantity: 50, price: 110.2, currency: "EUR", fxRate: 0.98, fee: 3, total: 5_510 },
  { id: "tx_vwce_dividend", accountId: ids.degiro, securityId: ids.vwce, type: "DIVIDEND", timestamp: "2026-06-28T08:00:00Z", currency: "EUR", fxRate: 0.95, fee: 0.8, total: 82 },
  { id: "tx_degiro_fee", accountId: ids.degiro, type: "FEE", timestamp: "2026-07-01T08:00:00Z", currency: "EUR", fxRate: 0.95, total: 12, notes: "Fictional connectivity fee" },
];

function deterministicUnit(index: number) {
  let value = (index + 1) * 2_654_435_761;
  value ^= value >>> 16;
  value = Math.imul(value, 2_246_822_519);
  value ^= value >>> 13;
  value = Math.imul(value, 3_266_489_917);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function dailyMarketReturn(index: number) {
  const ordinaryMove = (deterministicUnit(index) - 0.5) * 0.014;
  const openingMove = (deterministicUnit(index + 401) - 0.5) * 0.004;
  const shocks: Record<number, number> = { 17: -0.018, 18: -0.011, 46: 0.014, 74: -0.016, 96: 0.012 };
  return ordinaryMove + openingMove + (shocks[index] ?? 0) + 0.00035;
}

async function main() {
  await prisma.securitySnapshot.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.priceQuote.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.securityAlias.deleteMany();
  await prisma.securityUnderlyingHolding.deleteMany();
  await prisma.security.deleteMany();
  await prisma.brokerAccount.deleteMany();

  await prisma.brokerAccount.createMany({
    data: [
      { id: ids.trading212, brokerName: "Trading 212", accountName: "Invest", baseCurrency: "CHF" },
      { id: ids.degiro, brokerName: "DEGIRO", accountName: "Personal", baseCurrency: "EUR" },
    ],
  });

  await prisma.security.createMany({
    data: [
      { id: ids.vwce, isin: "IE00BK5BQT80", ticker: "VWCE", name: "Vanguard FTSE All-World UCITS ETF", assetType: "ETF", exchange: "XETRA", tradingCurrency: "EUR", marketDataTicker: "VWCE.DE", marketDataProvider: "MOCK" },
      { id: ids.nesn, isin: "CH0038863350", ticker: "NESN", name: "Nestlé S.A.", assetType: "STOCK", exchange: "SIX", tradingCurrency: "CHF", marketDataTicker: "NESN.SW", marketDataProvider: "MOCK" },
      { id: ids.on, isin: "US6821891057", ticker: "ON", name: "ON Semiconductor Corporation", assetType: "STOCK", exchange: "NASDAQ", tradingCurrency: "USD", marketDataTicker: "ON", marketDataProvider: "MOCK" },
      { id: ids.eimi, isin: "IE00BKM4GZ66", ticker: "EIMI", name: "iShares Core MSCI EM IMI UCITS ETF", assetType: "ETF", exchange: "LSE", tradingCurrency: "GBP", marketDataTicker: "EIMI.L", marketDataProvider: "MOCK" },
    ],
  });

  await prisma.securityRegionalExposure.createMany({
    data: [
      { securityId: ids.vwce, region: "North America", weight: 64.6, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.vwce, region: "Europe", weight: 12.12, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.vwce, region: "Pacific", weight: 9.98, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.vwce, region: "Emerging Markets", weight: 7.6, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.nesn, region: "Europe", weight: 100, source: "SEED" },
      { securityId: ids.on, region: "North America", weight: 100, source: "SEED" },
      { securityId: ids.eimi, region: "Emerging Markets", weight: 100, source: "SEED" },
    ],
  });

  await prisma.securityUnderlyingHolding.createMany({
    data: [
      { securityId: ids.vwce, constituentTicker: "NVDA", constituentName: "NVIDIA Corporation", weight: 4.14, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.vwce, constituentTicker: "AAPL", constituentName: "Apple Inc.", weight: 3.69, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.vwce, constituentTicker: "MSFT", constituentName: "Microsoft Corporation", weight: 3.13, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.eimi, constituentTicker: "TSM", constituentName: "Taiwan Semiconductor Manufacturing", weight: 10.24, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
      { securityId: ids.eimi, constituentTicker: "TCEHY", constituentName: "Tencent Holdings", weight: 3.64, source: "SEED", asOf: new Date("2026-07-31T12:00:00Z") },
    ],
  });

  await prisma.securityAlias.createMany({
    data: [
      { securityId: ids.vwce, brokerAccountId: ids.degiro, source: "DEGIRO", brokerSymbol: "VWCE", sourceSecurityId: "fictional-vwce-id" },
      { securityId: ids.eimi, brokerAccountId: ids.degiro, source: "DEGIRO", brokerSymbol: "EIMI", sourceSecurityId: "fictional-eimi-id" },
      { securityId: ids.nesn, brokerAccountId: ids.trading212, source: "TRADING212", brokerSymbol: "NESN_CH_EQ" },
      { securityId: ids.on, brokerAccountId: ids.trading212, source: "TRADING212", brokerSymbol: "ON_US_EQ" },
    ],
  });

  for (const item of transactions) {
    const fee = item.fee ?? 0;
    await prisma.transaction.create({
      data: {
        id: item.id,
        brokerAccountId: item.accountId,
        securityId: item.securityId,
        type: item.type,
        timestamp: new Date(item.timestamp),
        quantity: item.quantity,
        executionPrice: item.price,
        transactionCurrency: item.currency,
        fxRateToChf: item.fxRate,
        fee,
        feeChf: fee * item.fxRate,
        totalValue: item.total,
        totalValueChf: item.total * item.fxRate,
        importSource: "SEED",
        externalId: item.id,
        importFingerprint: `fictional-${item.id}`,
        notes: item.notes,
      },
    });
  }

  const quotedAt = new Date("2026-08-31T16:10:00Z");
  const quoteInputs = [
    { securityId: ids.vwce, price: 129.2, previousClose: 128.4, currency: "EUR", fxRateToChf: 0.94 },
    { securityId: ids.nesn, price: 85.15, previousClose: 84.8, currency: "CHF", fxRateToChf: 1 },
    { securityId: ids.on, price: 53.9, previousClose: 52.95, currency: "USD", fxRateToChf: 0.79 },
    { securityId: ids.eimi, price: 32.15, previousClose: 32.3, currency: "GBP", fxRateToChf: 1.06 },
  ];
  await prisma.priceQuote.createMany({
    data: quoteInputs.map((quote) => ({ ...quote, provider: "MOCK", quotedAt })),
  });

  const dbTransactions = await prisma.transaction.findMany();
  const summary = calculatePortfolio({
    transactions: dbTransactions.map((transaction): AccountingTransaction => ({
      id: transaction.id,
      securityId: transaction.securityId,
      brokerAccountId: transaction.brokerAccountId,
      type: transaction.type as TransactionType,
      timestamp: transaction.timestamp,
      quantity: transaction.quantity?.toNumber() ?? null,
      executionPrice: transaction.executionPrice?.toNumber() ?? null,
      transactionCurrency: transaction.transactionCurrency,
      fxRateToChf: transaction.fxRateToChf.toNumber(),
      fee: transaction.fee.toNumber(),
      feeChf: transaction.feeChf.toNumber(),
      totalValue: transaction.totalValue.toNumber(),
      totalValueChf: transaction.totalValueChf.toNumber(),
    })),
    securities: (await prisma.security.findMany()).map((security) => ({
      id: security.id,
      isin: security.isin,
      ticker: security.ticker,
      name: security.name,
      assetType: security.assetType,
      exchange: security.exchange,
      tradingCurrency: security.tradingCurrency,
      marketDataTicker: security.marketDataTicker,
      marketDataProvider: security.marketDataProvider,
    })),
    brokerAccounts: (await prisma.brokerAccount.findMany()).map((account) => ({
      id: account.id,
      brokerName: account.brokerName,
      accountName: account.accountName,
      baseCurrency: account.baseCurrency,
    })),
    quotes: quoteInputs.map((quote) => ({ ...quote, provider: "MOCK", quotedAt })),
  });

  const snapshotEnd = new Date("2026-08-31T18:00:00Z");
  const snapshots = [];
  const securitySnapshots = [];
  const levels = [1];
  for (let day = 1; day <= 120; day += 1) levels.push(levels[day - 1] * (1 + dailyMarketReturn(day)));
  const finalLevel = levels.at(-1) ?? 1;
  for (let daysAgo = 120; daysAgo >= 0; daysAgo -= 1) {
    const day = 120 - daysAgo;
    const progress = day / 120;
    const timestamp = new Date(snapshotEnd);
    timestamp.setUTCDate(snapshotEnd.getUTCDate() - daysAgo);
    const portfolioValueChf = daysAgo === 0
      ? summary.portfolioValueChf
      : summary.portfolioValueChf * (levels[day] / finalLevel);
    snapshots.push({
      timestamp,
      portfolioValueChf,
      investedCapitalChf: summary.investedCapitalChf,
      cashChf: summary.cashChf,
      unrealizedPnlChf: Math.max(0, portfolioValueChf - summary.netContributionsChf - summary.realizedPnlChf),
      realizedPnlChf: summary.realizedPnlChf,
    });
    for (const [index, position] of summary.positions.entries()) {
      if (position.marketValueChf === null || position.totalPnlChf === null) continue;
      const positionLevel = levels[day] * (1 + (deterministicUnit(day + index * 73) - 0.5) * 0.006);
      const normalizedPositionLevel = positionLevel / finalLevel;
      securitySnapshots.push({
        securityId: position.securityId,
        timestamp,
        marketValueChf: Math.max(0, position.marketValueChf * normalizedPositionLevel),
        totalPnlChf: position.totalPnlChf - (1 - progress) * position.marketValueChf * 0.08 + position.marketValueChf * (normalizedPositionLevel - 1),
      });
    }
  }
  await prisma.portfolioSnapshot.createMany({ data: snapshots });
  await prisma.securitySnapshot.createMany({ data: securitySnapshots });

  console.log(`Seeded ${transactions.length} fictional transactions across 2 broker accounts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
