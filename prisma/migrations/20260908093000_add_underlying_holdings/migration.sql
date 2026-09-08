CREATE TABLE "SecurityUnderlyingHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "constituentTicker" TEXT NOT NULL,
    "constituentName" TEXT NOT NULL,
    "weight" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "asOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityUnderlyingHolding_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SecurityUnderlyingHolding_securityId_constituentTicker_key" ON "SecurityUnderlyingHolding"("securityId", "constituentTicker");
CREATE INDEX "SecurityUnderlyingHolding_securityId_idx" ON "SecurityUnderlyingHolding"("securityId");
