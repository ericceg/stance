import "server-only";

import { fxRateProvider } from "@/lib/providers/fx";
import { loadPortfolio } from "./service";

const DAY_MS = 86_400_000;

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Estimates the CHF effect of currency moves while holding today's local market
 * value constant. It deliberately does not claim to be total investment return:
 * the remainder is the security-price movement in its own currency.
 */
export async function getCurrencyInsights() {
  const data = await loadPortfolio();
  const positions = data.summary.positions.filter((position) => position.quantity > 0 && position.quote && position.marketValueChf !== null);
  const byCurrency = new Map<string, { marketValueChf: number; localValue: number; fxImpactChf: number; weightedCostRate: number }>();

  for (const position of positions) {
    const quote = position.quote!;
    const currency = quote.currency;
    const localValue = position.quantity * quote.price;
    const costRate = position.costBasisLocal > 0 ? position.costBasisChf / position.costBasisLocal : quote.fxRateToChf;
    const fxImpactChf = localValue * (quote.fxRateToChf - costRate);
    const existing = byCurrency.get(currency) ?? { marketValueChf: 0, localValue: 0, fxImpactChf: 0, weightedCostRate: 0 };
    existing.marketValueChf += position.marketValueChf!;
    existing.localValue += localValue;
    existing.fxImpactChf += fxImpactChf;
    existing.weightedCostRate += localValue * costRate;
    byCurrency.set(currency, existing);
  }

  const exposure = [...byCurrency.entries()].map(([currency, values]) => ({
    currency,
    marketValueChf: values.marketValueChf,
    fxImpactChf: values.fxImpactChf,
    costRateToChf: values.localValue > 0 ? values.weightedCostRate / values.localValue : 1,
    currentRateToChf: values.localValue > 0 ? values.marketValueChf / values.localValue : 1,
  })).sort((left, right) => right.marketValueChf - left.marketValueChf);

  const foreignCurrencies = exposure.filter((item) => item.currency !== "CHF").map((item) => item.currency);
  const foreignTransactions = data.accountingTransactions.filter((transaction) => foreignCurrencies.includes(transaction.transactionCurrency));
  const firstDate = foreignTransactions.reduce<Date | null>((earliest, transaction) => (
    earliest === null || transaction.timestamp < earliest ? transaction.timestamp : earliest
  ), null);
  const today = utcDay(new Date());
  const requests = firstDate === null ? [] : Array.from(
    { length: Math.min(1_100, Math.floor((today.getTime() - utcDay(firstDate).getTime()) / DAY_MS) + 1) },
    (_, index) => new Date(today.getTime() - (Math.min(1_100, Math.floor((today.getTime() - utcDay(firstDate).getTime()) / DAY_MS) + 1) - index - 1) * DAY_MS),
  );

  let history: Array<{ currency: string; timestamp: string; rateToChf: number }> = [];
  try {
    const rates = await fxRateProvider.getHistoricalRatesToChf(foreignCurrencies.flatMap((currency) => requests.map((date) => ({ currency, date }))));
    history = foreignCurrencies.flatMap((currency) => requests.map((date) => {
      const rateToChf = rates.get(`${currency}|${date.toISOString().slice(0, 10)}`);
      return rateToChf ? { currency, timestamp: date.toISOString(), rateToChf } : null;
    }).filter((point): point is { currency: string; timestamp: string; rateToChf: number } => point !== null));
  } catch {
    // The rest of the page remains useful if the optional reference-rate service is unavailable.
  }

  return {
    exposure,
    history,
    totalForeignExposureChf: exposure.filter((item) => item.currency !== "CHF").reduce((total, item) => total + item.marketValueChf, 0),
    totalFxImpactChf: exposure.filter((item) => item.currency !== "CHF").reduce((total, item) => total + item.fxImpactChf, 0),
  };
}
