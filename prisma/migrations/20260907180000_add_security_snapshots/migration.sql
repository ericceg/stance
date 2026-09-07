CREATE TABLE "SecuritySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "marketValueChf" DECIMAL NOT NULL,
    "totalPnlChf" DECIMAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'HISTORICAL_CLOSE',
    CONSTRAINT "SecuritySnapshot_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SecuritySnapshot_securityId_timestamp_key" ON "SecuritySnapshot"("securityId", "timestamp");
CREATE INDEX "SecuritySnapshot_timestamp_idx" ON "SecuritySnapshot"("timestamp");
