-- SQLite stores Prisma DateTime values as Unix milliseconds. Reclassify every
-- legacy snapshot that is not the UTC day-end value used by reconstruction.
UPDATE "PortfolioSnapshot"
SET "source" = 'LIVE_ESTIMATE'
WHERE ("timestamp" % 86400000) != 86399999;
