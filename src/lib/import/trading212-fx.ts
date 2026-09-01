import type { Trading212HistoricalOrder } from "../providers/broker";

function positiveRate(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function localToAccountRate(order: Trading212HistoricalOrder, fill: NonNullable<Trading212HistoricalOrder["fill"]>) {
  const gross = Math.abs(fill.price * fill.quantity);
  if (order.order.instrument.currency === fill.walletImpact.currency) return 1;

  // Trading 212 reports account-currency units per instrument-currency unit
  // as the reciprocal of walletImpact.fxRate.
  const explicit = positiveRate(fill.walletImpact.fxRate);
  if (explicit) return 1 / explicit;

  // Fall back to the wallet impact for older fills without fxRate. netValue
  // includes account-currency taxes, while the transaction's gross value does
  // not, so remove them for buys and add them back for sells.
  const accountTaxes = fill.walletImpact.taxes
    .filter((tax) => tax.currency === fill.walletImpact.currency)
    .reduce((total, tax) => total + Math.abs(tax.quantity), 0);
  const net = Math.abs(fill.walletImpact.netValue);
  const grossAccount = order.order.side === "BUY" ? net - accountTaxes : net + accountTaxes;
  const derived = gross > 0 ? grossAccount / gross : 0;
  return derived > 0 ? derived : null;
}
