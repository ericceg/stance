-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "exchange" TEXT,
    "tradingCurrency" TEXT NOT NULL,
    "marketDataTicker" TEXT,
    "marketDataProvider" TEXT NOT NULL DEFAULT 'MOCK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brokerName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "brokerAccountId" TEXT,
    "source" TEXT NOT NULL,
    "brokerSymbol" TEXT NOT NULL,
    "sourceSecurityId" TEXT,
    CONSTRAINT "SecurityAlias_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SecurityAlias_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT,
    "brokerAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "quantity" DECIMAL,
    "executionPrice" DECIMAL,
    "transactionCurrency" TEXT NOT NULL,
    "fxRateToChf" DECIMAL NOT NULL DEFAULT 1,
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "feeChf" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL,
    "totalValueChf" DECIMAL NOT NULL,
    "notes" TEXT,
    "importSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "importFingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "previousClose" DECIMAL,
    "currency" TEXT NOT NULL,
    "fxRateToChf" DECIMAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "quotedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceQuote_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL,
    "portfolioValueChf" DECIMAL NOT NULL,
    "investedCapitalChf" DECIMAL NOT NULL,
    "cashChf" DECIMAL NOT NULL,
    "unrealizedPnlChf" DECIMAL NOT NULL,
    "realizedPnlChf" DECIMAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Security_isin_key" ON "Security"("isin");

-- CreateIndex
CREATE INDEX "Security_ticker_idx" ON "Security"("ticker");

-- CreateIndex
CREATE INDEX "Security_assetType_idx" ON "Security"("assetType");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerAccount_brokerName_accountName_key" ON "BrokerAccount"("brokerName", "accountName");

-- CreateIndex
CREATE INDEX "SecurityAlias_securityId_idx" ON "SecurityAlias"("securityId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAlias_source_brokerSymbol_key" ON "SecurityAlias"("source", "brokerSymbol");

-- CreateIndex
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

-- CreateIndex
CREATE INDEX "Transaction_securityId_timestamp_idx" ON "Transaction"("securityId", "timestamp");

-- CreateIndex
CREATE INDEX "Transaction_brokerAccountId_timestamp_idx" ON "Transaction"("brokerAccountId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_brokerAccountId_importSource_externalId_key" ON "Transaction"("brokerAccountId", "importSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_brokerAccountId_importFingerprint_key" ON "Transaction"("brokerAccountId", "importFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PriceQuote_securityId_key" ON "PriceQuote"("securityId");

-- CreateIndex
CREATE INDEX "PriceQuote_quotedAt_idx" ON "PriceQuote"("quotedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_timestamp_key" ON "PortfolioSnapshot"("timestamp");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_timestamp_idx" ON "PortfolioSnapshot"("timestamp");
