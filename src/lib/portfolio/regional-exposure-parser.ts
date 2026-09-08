export const PORTFOLIO_REGIONS = [
  "North America",
  "Europe",
  "Pacific",
  "Emerging Markets",
  "Other",
] as const;

export type PortfolioRegion = (typeof PORTFOLIO_REGIONS)[number];

export interface ParsedExposure {
  region: PortfolioRegion;
  weight: number;
}

const regionByCountryCode: Record<string, PortfolioRegion> = {
  US: "North America", CA: "North America",
  CH: "Europe", DE: "Europe", AT: "Europe", BE: "Europe", DK: "Europe", ES: "Europe",
  FI: "Europe", FR: "Europe", GB: "Europe", GR: "Europe", IE: "Europe", IS: "Europe",
  IT: "Europe", LI: "Europe", LU: "Europe", NL: "Europe", NO: "Europe", PL: "Europe",
  PT: "Europe", SE: "Europe",
  AU: "Pacific", HK: "Pacific", JP: "Pacific", NZ: "Pacific", SG: "Pacific",
  BR: "Emerging Markets", CL: "Emerging Markets", CN: "Emerging Markets", CO: "Emerging Markets",
  CZ: "Emerging Markets", EG: "Emerging Markets", HU: "Emerging Markets", ID: "Emerging Markets",
  IN: "Emerging Markets", KR: "Emerging Markets", MX: "Emerging Markets", MY: "Emerging Markets",
  PE: "Emerging Markets", PH: "Emerging Markets", QA: "Emerging Markets", SA: "Emerging Markets",
  TH: "Emerging Markets", TR: "Emerging Markets", TW: "Emerging Markets", ZA: "Emerging Markets",
};

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVanguardMarketAllocation(html: string): { exposures: ParsedExposure[]; asOf?: Date } | null {
  const sectionStart = html.search(/Market allocation/i);
  if (sectionStart < 0) return null;
  const section = html.slice(sectionStart, sectionStart + 60_000);
  const totals = new Map<PortfolioRegion, number>();
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of section.matchAll(rowPattern)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1]));
    if (cells.length < 3) continue;
    const region = cells[1] as PortfolioRegion;
    if (!PORTFOLIO_REGIONS.includes(region)) continue;
    const weight = Number.parseFloat(cells[2].replace("%", ""));
    if (!Number.isFinite(weight) || weight <= 0) continue;
    totals.set(region, (totals.get(region) ?? 0) + weight);
  }
  if (totals.size === 0) return null;
  const dateMatch = section.match(/As at\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  const asOf = dateMatch ? new Date(`${dateMatch[1]} 12:00:00 UTC`) : undefined;
  return {
    exposures: [...totals].map(([region, weight]) => ({ region, weight: Number(weight.toFixed(6)) })),
    asOf: asOf && Number.isFinite(asOf.getTime()) ? asOf : undefined,
  };
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseIsharesGeographicExposure(html: string): { exposures: ParsedExposure[]; asOf?: Date } | null {
  const match = html.match(/<walrus-render-on-client[^>]+componentprops="([^"]+)"[^>]+componentkey="exposureBreakdowns"/i);
  if (!match) return null;
  let props: unknown;
  try {
    props = JSON.parse(decodeHtmlAttribute(match[1]));
  } catch {
    return null;
  }
  const countries = (props as {
    containersByNameMap?: { geography?: { subContainersByNameMap?: { countries?: { dataPointsByNameMap?: Record<string, { value?: unknown }> } } } };
  }).containersByNameMap?.geography?.subContainersByNameMap?.countries?.dataPointsByNameMap;
  const codes = countries?.code?.value;
  const weights = countries?.fund?.value;
  if (!Array.isArray(codes) || !Array.isArray(weights) || codes.length !== weights.length) return null;
  const totals = new Map<PortfolioRegion, number>();
  for (let index = 0; index < codes.length; index += 1) {
    const code = String(codes[index]).toUpperCase();
    const weight = Number(weights[index]);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const region = regionByCountryCode[code] ?? "Other";
    totals.set(region, (totals.get(region) ?? 0) + weight);
  }
  if (totals.size === 0) return null;
  const rawDate = countries?.asOf?.value;
  const dateText = typeof rawDate === "number" || typeof rawDate === "string" ? String(rawDate) : "";
  const asOf = /^\d{8}$/.test(dateText)
    ? new Date(`${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}T12:00:00.000Z`)
    : undefined;
  return { exposures: [...totals].map(([region, weight]) => ({ region, weight: Number(weight.toFixed(6)) })), asOf };
}
