export interface ParsedUnderlyingHolding {
  ticker: string;
  name: string;
  weight: number;
}

function text(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
}

function stableKey(name: string, occurrence: number) {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "HOLDING";
  return `${normalized}-${occurrence}`;
}

export function parseVanguardUnderlyingHoldings(html: string): { holdings: ParsedUnderlyingHolding[]; asOf?: Date } | null {
  const start = html.search(/Holdings details/i);
  if (start < 0) return null;
  const section = html.slice(start, start + 750_000);
  const holdings: ParsedUnderlyingHolding[] = [];
  const seen = new Map<string, number>();
  for (const match of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => text(cell[1]));
    if (cells.length < 2) continue;
    const name = cells[0];
    const weight = Number.parseFloat(cells[1].replace("%", ""));
    if (!name || !Number.isFinite(weight) || weight <= 0 || weight > 100) continue;
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    holdings.push({ ticker: stableKey(name, occurrence), name, weight });
  }
  if (holdings.length === 0) return null;
  const asOfMatch = section.match(/As at\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
  const asOf = asOfMatch ? new Date(`${asOfMatch[1]} 12:00:00 UTC`) : undefined;
  return { holdings, asOf: asOf && Number.isFinite(asOf.getTime()) ? asOf : undefined };
}
