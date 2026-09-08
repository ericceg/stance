-- CreateTable
CREATE TABLE "SecurityRegionalExposure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "weight" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "asOf" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityRegionalExposure_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SecurityRegionalExposure_securityId_region_key" ON "SecurityRegionalExposure"("securityId", "region");
CREATE INDEX "SecurityRegionalExposure_securityId_idx" ON "SecurityRegionalExposure"("securityId");
