import "server-only";

import { z } from "zod";

const FRANKFURTER_API_URL = "https://api.frankfurter.dev/v2";
const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const rateSchema = z.object({
  date: z.string(),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive(),
});

export interface HistoricalFxRequest {
  currency: string;
  date: Date | string;
}

export class FxRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxRateError";
  }
}

function normalizeCurrency(currency: string) {
  const parsed = currencySchema.safeParse(currency);
  if (!parsed.success) throw new FxRateError(`“${currency}” is not a valid currency code.`);
  return parsed.data;
}

export function fxDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new FxRateError("The transaction date is invalid.");
  return date.toISOString().slice(0, 10);
}

export function historicalFxKey(currency: string, date: Date | string) {
  return `${normalizeCurrency(currency)}|${fxDate(date)}`;
}

function previousDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return fxDate(value);
}

async function fetchJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3_600 },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new FxRateError(error instanceof Error && error.name === "TimeoutError"
      ? "The automatic FX service did not respond in time. Try again."
      : "The automatic FX service could not be reached. Check the network connection and try again.");
  }
  if (!response.ok) throw new FxRateError(`The automatic FX service returned HTTP ${response.status}. Try again.`);
  return response.json();
}

/** Daily reference rates supplied automatically by Frankfurter's public API. */
export class FrankfurterFxProvider {
  readonly name = "Frankfurter";

  async getCurrentRateToChf(fromCurrency: string) {
    const currency = normalizeCurrency(fromCurrency);
    if (currency === "CHF") return 1;

    const parsed = rateSchema.safeParse(await fetchJson(new URL(
      `${FRANKFURTER_API_URL}/rate/${currency}/CHF`,
    )));
    if (!parsed.success || parsed.data.base !== currency || parsed.data.quote !== "CHF") {
      throw new FxRateError(`No automatic ${currency}/CHF rate is currently available.`);
    }
    return parsed.data.rate;
  }

  async getHistoricalRatesToChf(requests: HistoricalFxRequest[]) {
    const result = new Map<string, number>();
    const datesByCurrency = new Map<string, Set<string>>();

    for (const request of requests) {
      const currency = normalizeCurrency(request.currency);
      const date = fxDate(request.date);
      if (currency === "CHF") {
        result.set(historicalFxKey(currency, date), 1);
        continue;
      }
      const dates = datesByCurrency.get(currency) ?? new Set<string>();
      dates.add(date);
      datesByCurrency.set(currency, dates);
    }

    await Promise.all([...datesByCurrency].map(async ([currency, requestedDates]) => {
      const dates = [...requestedDates].sort();
      const url = new URL(`${FRANKFURTER_API_URL}/rates`);
      url.searchParams.set("base", currency);
      url.searchParams.set("quotes", "CHF");
      url.searchParams.set("from", previousDate(dates[0], 7));
      url.searchParams.set("to", dates.at(-1)!);
      const parsed = z.array(rateSchema).safeParse(await fetchJson(url));
      if (!parsed.success) throw new FxRateError(`The automatic FX service returned invalid ${currency}/CHF data.`);

      const observations = parsed.data
        .filter((item) => item.base === currency && item.quote === "CHF")
        .sort((left, right) => left.date.localeCompare(right.date));
      for (const date of dates) {
        const observation = observations.findLast((item) => item.date <= date);
        if (!observation) throw new FxRateError(`No automatic ${currency}/CHF rate is available for ${date}.`);
        result.set(historicalFxKey(currency, date), observation.rate);
      }
    }));

    return result;
  }
}

export const fxRateProvider = new FrankfurterFxProvider();
