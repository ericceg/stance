import "server-only";

import type { Prisma, Security } from "@prisma/client";

export interface ImportedSecurityIdentity {
  source: string;
  brokerAccountId: string;
  brokerSymbol: string | null;
  sourceSecurityId?: string | null;
  isin: string | null;
  ticker: string | null;
  name: string | null;
  tradingCurrency: string;
  assetType?: string | null;
  authoritativeTradingCurrency?: boolean;
}

function fallbackTicker(identity: ImportedSecurityIdentity) {
  const source = identity.ticker || identity.brokerSymbol || identity.isin || identity.name || "UNKNOWN";
  return source.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 24) || "UNKNOWN";
}

function supportedAssetType(value: string | null | undefined) {
  if (value === "ETF") return "ETF";
  if (value === "STOCK") return "STOCK";
  return "OTHER";
}

async function reconcileImportedSecurity(
  tx: Prisma.TransactionClient,
  security: Security,
  identity: ImportedSecurityIdentity,
) {
  const importedAssetType = supportedAssetType(identity.assetType);
  const assetType = security.assetType === "OTHER" ? importedAssetType : security.assetType;
  const tradingCurrency = identity.authoritativeTradingCurrency
    ? identity.tradingCurrency
    : security.tradingCurrency;
  if (security.assetType === assetType && security.tradingCurrency === tradingCurrency) return security;
  return tx.security.update({
    where: { id: security.id },
    data: { assetType, tradingCurrency },
  });
}

export async function resolveImportedSecurity(
  tx: Prisma.TransactionClient,
  identity: ImportedSecurityIdentity,
) {
  const brokerSymbol = identity.brokerSymbol?.trim() || null;
  if (brokerSymbol) {
    const alias = await tx.securityAlias.findUnique({
      where: { source_brokerSymbol: { source: identity.source, brokerSymbol } },
      include: { security: true },
    });
    if (alias) return reconcileImportedSecurity(tx, alias.security, identity);
  }

  const isin = identity.isin?.trim().toUpperCase() || null;
  let security = isin ? await tx.security.findUnique({ where: { isin } }) : null;
  if (!security) {
    const ticker = fallbackTicker(identity);
    security = await tx.security.create({
      data: {
        isin,
        ticker,
        name: identity.name?.trim() || ticker,
        assetType: supportedAssetType(identity.assetType),
        tradingCurrency: identity.tradingCurrency,
        marketDataTicker: null,
        marketDataProvider: identity.source,
      },
    });
  } else {
    security = await reconcileImportedSecurity(tx, security, identity);
  }

  if (brokerSymbol) {
    await tx.securityAlias.create({
      data: {
        securityId: security.id,
        brokerAccountId: identity.brokerAccountId,
        source: identity.source,
        brokerSymbol,
        sourceSecurityId: identity.sourceSecurityId || null,
      },
    });
  }
  return security;
}
