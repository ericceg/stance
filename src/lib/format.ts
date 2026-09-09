const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function groupInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function fixedNumber(value: number, fractionDigits: number) {
  const [integer, fraction] = Math.abs(value).toFixed(fractionDigits).split(".");
  return fractionDigits === 0 ? groupInteger(integer) : `${groupInteger(integer)}.${fraction}`;
}

export function formatChf(value: number, options?: { signed?: boolean }) {
  const formatted = `CHF ${fixedNumber(value, 2)}`;
  if (Math.abs(value) < 0.005) return formatted;
  if (value < 0) return `−${formatted}`;
  return options?.signed ? `+${formatted}` : formatted;
}

export function formatPercent(value: number, options?: { signed?: boolean }) {
  const formatted = `${fixedNumber(value, 2)}%`;
  if (Math.abs(value) < 0.005) return formatted;
  if (value < 0) return `−${formatted}`;
  return options?.signed ? `+${formatted}` : formatted;
}

export function formatNumber(value: number, maximumFractionDigits = 4) {
  const rounded = Math.abs(value).toFixed(maximumFractionDigits).replace(/\.?0+$/, "");
  const [integer, fraction] = rounded.split(".");
  return `${value < 0 ? "−" : ""}${groupInteger(integer)}${fraction ? `.${fraction}` : ""}`;
}

export function formatCurrency(value: number, currency: string) {
  return `${value < -0.005 ? "−" : ""}${currency} ${fixedNumber(value, 2)}`;
}

export function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${String(date.getUTCDate()).padStart(2, "0")} ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatChartDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${String(date.getUTCDate()).padStart(2, "0")} ${monthNames[date.getUTCMonth()]}`;
}

export function toneForValue(value: number | null) {
  if (value === null || Math.abs(value) < 0.005) return "neutral" as const;
  return value > 0 ? "positive" as const : "negative" as const;
}
