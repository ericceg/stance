-- Historical reconstructions are end-of-day closes. Existing points at any
-- other time were created from live, mixed quotes and must not be connected to
-- the historical performance series.
ALTER TABLE "PortfolioSnapshot" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'HISTORICAL_CLOSE';

UPDATE "PortfolioSnapshot"
SET "source" = 'LIVE_ESTIMATE'
WHERE strftime('%H:%M:%f', "timestamp") != '23:59:59.999';
