import type { TransactionType } from "@/lib/portfolio/types";

export type DegiroStatementKind = "transactions" | "account";

export interface DegiroImportRow {
  rowNumber: number;
  externalId: string | null;
  occurredAt: string;
  type: TransactionType;
  product: string | null;
  isin: string | null;
  brokerSymbol: string | null;
  quantity: number | null;
  executionPrice: number | null;
  transactionCurrency: string;
  fxRateToChf: number;
  fee: number;
  feeChf: number;
  totalValue: number;
  totalValueChf: number;
  notes: string;
}

export interface DegiroParseResult {
  kind: DegiroStatementKind;
  rows: DegiroImportRow[];
  ignoredRows: number;
  warnings: string[];
}

interface DegiroParseOptions {
  accountBaseCurrency: string;
  accountToChfRate?: number;
}

const HEADER_ALIASES = {
  date: ["date", "datum", "data"],
  time: ["time", "zeit", "tijd", "ora"],
  product: ["product", "produkt", "prodotto"],
  isin: ["isin"],
  reference: ["reference", "referenz", "referentie", "riferimento"],
  quantity: ["quantity", "anzahl", "aantal", "quantita"],
  price: ["price", "kurs", "koers", "prezzo"],
  localValue: ["localvalue", "lokalerwert", "lokalewert", "lokalewaarde", "valorelocale"],
  value: ["value", "wert", "waarde", "valore"],
  fees: [
    "transactionandorthirdpartyfees",
    "transaktionsundoderfremdkosten",
    "transactieenofexternekosten",
    "commissioniditransazioneeoditerze parti",
  ],
  total: ["total", "gesamt", "totaal", "totale"],
  orderId: ["orderid", "order id", "order-id", "auftragsid", "ordernummer", "ordineid"],
  description: ["description", "beschreibung", "omschrijving", "descrizione"],
  change: ["change", "anderung", "mutatie", "variazione"],
} as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

/** RFC 4180-style parser with automatic comma/semicolon detection. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseLocalizedNumber(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  let value = rawValue.replace(/[\s\u00a0'’]/g, "").replace(/[^0-9,.-]/g, "");
  if (!value || value === "-" || value === "." || value === ",") return null;

  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    value = value
      .replace(decimal === "," ? /\./g : /,/g, "")
      .replace(decimal, ".");
  } else if (comma >= 0) {
    const parts = value.split(",");
    value = parts.length === 2 ? `${parts[0]}.${parts[1]}` : `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  } else if ((value.match(/\./g) ?? []).length > 1) {
    const parts = value.split(".");
    value = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findColumn(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

function cell(row: string[], index: number) {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

function currencyAfter(row: string[], valueIndex: number) {
  const candidate = cell(row, valueIndex + 1).toUpperCase();
  return /^[A-Z]{3}$/.test(candidate) ? candidate : "";
}

function accountAmountAndCurrency(row: string[], changeIndex: number, fallbackCurrency: string) {
  const first = cell(row, changeIndex);
  const second = cell(row, changeIndex + 1);
  const firstIsCurrency = /^[A-Z]{3}$/i.test(first);
  const amount = parseLocalizedNumber(firstIsCurrency ? second : first);
  const currency = normalizeCurrency(firstIsCurrency ? first : second, fallbackCurrency);
  return { amount, currency };
}

function parseTimestamp(dateValue: string, timeValue: string): string | null {
  const dateParts = dateValue.trim().split(/[./-]/).map(Number);
  if (dateParts.length !== 3 || dateParts.some((part) => !Number.isInteger(part))) return null;
  const [first, second, third] = dateParts;
  const year = first > 1900 ? first : third;
  const month = first > 1900 ? second : second;
  const day = first > 1900 ? third : first;
  const [hour = 12, minute = 0, secondValue = 0] = timeValue.trim().split(":").map(Number);
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, secondValue));
  if (
    !Number.isFinite(timestamp.getTime())
    || timestamp.getUTCFullYear() !== year
    || timestamp.getUTCMonth() !== month - 1
    || timestamp.getUTCDate() !== day
  ) return null;
  return timestamp.toISOString();
}

function normalizeCurrency(value: string, fallback: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

function deriveFxToChf({
  localCurrency,
  grossLocal,
  baseCurrency,
  grossBase,
  accountBaseCurrency,
  accountToChfRate,
}: {
  localCurrency: string;
  grossLocal: number;
  baseCurrency: string;
  grossBase: number | null;
  accountBaseCurrency: string;
  accountToChfRate: number;
}) {
  if (localCurrency === "CHF") return 1;
  if (grossBase && grossBase > 0 && grossLocal > 0) {
    const localToBase = grossBase / grossLocal;
    if (baseCurrency === "CHF") return localToBase;
    if (baseCurrency === accountBaseCurrency) return localToBase * accountToChfRate;
  }
  if (localCurrency === accountBaseCurrency) return accountToChfRate;
  return accountToChfRate;
}

function makeBrokerSymbol(reference: string, isin: string, product: string) {
  if (reference) return reference;
  if (isin) return isin;
  const symbol = product.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
  return symbol || null;
}

function transactionStatement(
  matrix: string[][],
  options: Required<DegiroParseOptions>,
): DegiroParseResult {
  const [headers, ...records] = matrix;
  const columns = {
    date: findColumn(headers, HEADER_ALIASES.date),
    time: findColumn(headers, HEADER_ALIASES.time),
    product: findColumn(headers, HEADER_ALIASES.product),
    isin: findColumn(headers, HEADER_ALIASES.isin),
    reference: findColumn(headers, HEADER_ALIASES.reference),
    quantity: findColumn(headers, HEADER_ALIASES.quantity),
    price: findColumn(headers, HEADER_ALIASES.price),
    localValue: findColumn(headers, HEADER_ALIASES.localValue),
    value: findColumn(headers, HEADER_ALIASES.value),
    fees: findColumn(headers, HEADER_ALIASES.fees),
    total: findColumn(headers, HEADER_ALIASES.total),
    orderId: findColumn(headers, HEADER_ALIASES.orderId),
  };
  if ([columns.date, columns.quantity, columns.price].some((index) => index < 0)) {
    throw new Error("This does not look like a DEGIRO transaction statement. Expected Date, Quantity, and Price columns.");
  }

  const rows: DegiroImportRow[] = [];
  const warnings: string[] = [];
  let ignoredRows = 0;

  records.forEach((record, recordIndex) => {
    const rowNumber = recordIndex + 2;
    const occurredAt = parseTimestamp(cell(record, columns.date), cell(record, columns.time));
    const signedQuantity = parseLocalizedNumber(cell(record, columns.quantity));
    const executionPrice = parseLocalizedNumber(cell(record, columns.price));
    if (!occurredAt || !signedQuantity || !executionPrice || executionPrice <= 0) {
      warnings.push(`Row ${rowNumber} was skipped because its date, quantity, or price is invalid.`);
      ignoredRows += 1;
      return;
    }

    const quantity = Math.abs(signedQuantity);
    const localValue = Math.abs(parseLocalizedNumber(cell(record, columns.localValue)) ?? quantity * executionPrice);
    const baseValueRaw = parseLocalizedNumber(cell(record, columns.value));
    const baseValue = baseValueRaw === null ? null : Math.abs(baseValueRaw);
    const localCurrency = normalizeCurrency(
      currencyAfter(record, columns.price) || currencyAfter(record, columns.localValue),
      options.accountBaseCurrency,
    );
    const baseCurrency = normalizeCurrency(currencyAfter(record, columns.value), options.accountBaseCurrency);
    const fxRateToChf = deriveFxToChf({
      localCurrency,
      grossLocal: localValue,
      baseCurrency,
      grossBase: baseValue,
      accountBaseCurrency: options.accountBaseCurrency,
      accountToChfRate: options.accountToChfRate,
    });
    const feeAmount = Math.abs(parseLocalizedNumber(cell(record, columns.fees)) ?? 0);
    const feeCurrency = normalizeCurrency(currencyAfter(record, columns.fees), baseCurrency);
    const feeChf = feeCurrency === "CHF"
      ? feeAmount
      : feeCurrency === localCurrency
        ? feeAmount * fxRateToChf
        : feeAmount * options.accountToChfRate;
    const product = cell(record, columns.product);
    const isin = cell(record, columns.isin).toUpperCase();
    const reference = cell(record, columns.reference);
    const orderId = cell(record, columns.orderId);

    rows.push({
      rowNumber,
      externalId: orderId || null,
      occurredAt,
      type: signedQuantity > 0 ? "BUY" : "SELL",
      product: product || null,
      isin: isin || null,
      brokerSymbol: makeBrokerSymbol(reference, isin, product),
      quantity,
      executionPrice,
      transactionCurrency: localCurrency,
      fxRateToChf,
      fee: fxRateToChf > 0 ? feeChf / fxRateToChf : 0,
      feeChf,
      totalValue: localValue,
      totalValueChf: localValue * fxRateToChf,
      notes: `DEGIRO transaction statement row ${rowNumber}`,
    });
  });

  return { kind: "transactions", rows, ignoredRows, warnings };
}

const DESCRIPTION_PATTERNS = {
  deposit: ["deposit", "einzahlung", "storting", "versamento"],
  withdrawal: ["withdraw", "auszahlung", "opname", "prelievo"],
  dividend: ["dividend", "distribution", "coupon", "dividende", "dividendo"],
  interest: ["interest", "zins", "rente", "interesse"],
  fee: ["fee", "cost", "commission", "tax", "gebuhr", "kosten", "steuer", "provision", "quellensteuer", "commissie", "belasting", "imposta"],
  internal: ["cashsweeptransfer", "geldkontobeiderflatexdegirobank", "currencyexchange", "wahrungswechsel"],
};

function includesPattern(description: string, patterns: readonly string[]) {
  return patterns.some((pattern) => description.includes(pattern));
}

function classifyAccountRow(descriptionValue: string, amount: number): TransactionType | null {
  const description = normalizeHeader(descriptionValue);
  if (includesPattern(description, DESCRIPTION_PATTERNS.internal)) return null;
  if (includesPattern(description, DESCRIPTION_PATTERNS.fee)) return "FEE";
  if (includesPattern(description, DESCRIPTION_PATTERNS.deposit)) return amount >= 0 ? "DEPOSIT" : "WITHDRAWAL";
  if (includesPattern(description, DESCRIPTION_PATTERNS.withdrawal)) return "WITHDRAWAL";
  if (includesPattern(description, DESCRIPTION_PATTERNS.dividend)) return amount >= 0 ? "DIVIDEND" : "FEE";
  if (includesPattern(description, DESCRIPTION_PATTERNS.interest)) return amount >= 0 ? "DIVIDEND" : "FEE";
  return null;
}

function parseAccountTrade(description: string): {
  type: "BUY" | "SELL";
  quantity: number;
  executionPrice: number;
  currency: string;
} | null {
  const action = normalizeHeader(description.trim().split(/\s+/, 1)[0] ?? "");
  const type = ["buy", "kauf", "koop", "acquisto"].includes(action)
    ? "BUY"
    : ["sell", "verkauf", "verkoop", "vendita"].includes(action)
      ? "SELL"
      : null;
  if (!type) return null;

  const currencyMatch = description.match(/\b([A-Z]{3})\b/);
  if (!currencyMatch || currencyMatch.index === undefined) return null;
  const numericPart = description.slice(0, currencyMatch.index);
  const values = numericPart.match(/[+-]?\d+(?:[.,]\d+)?/g) ?? [];
  const quantity = Math.abs(parseLocalizedNumber(values[0]) ?? 0);
  const executionPrice = Math.abs(parseLocalizedNumber(values[1]) ?? 0);
  if (quantity <= 0 || executionPrice <= 0) return null;

  return { type, quantity, executionPrice, currency: currencyMatch[1] };
}

function accountStatement(
  matrix: string[][],
  options: Required<DegiroParseOptions>,
): DegiroParseResult {
  const [headers, ...records] = matrix;
  const columns = {
    date: findColumn(headers, HEADER_ALIASES.date),
    time: findColumn(headers, HEADER_ALIASES.time),
    product: findColumn(headers, HEADER_ALIASES.product),
    isin: findColumn(headers, HEADER_ALIASES.isin),
    description: findColumn(headers, HEADER_ALIASES.description),
    change: findColumn(headers, HEADER_ALIASES.change),
    orderId: findColumn(headers, HEADER_ALIASES.orderId),
  };
  if ([columns.date, columns.description, columns.change].some((index) => index < 0)) {
    throw new Error("This does not look like a DEGIRO account statement. Expected Date, Description, and Change columns.");
  }

  const rows: DegiroImportRow[] = [];
  const warnings: string[] = [];
  let ignoredRows = 0;

  const accountRecords = records.map((record, recordIndex) => {
    const { amount, currency } = accountAmountAndCurrency(
      record,
      columns.change,
      options.accountBaseCurrency,
    );
    return {
      record,
      rowNumber: recordIndex + 2,
      occurredAt: parseTimestamp(cell(record, columns.date), cell(record, columns.time)),
      description: cell(record, columns.description),
      amount,
      currency,
      orderId: cell(record, columns.orderId),
    };
  });

  const chfConversionByOrderId = new Map<string, number>();
  accountRecords.forEach((entry) => {
    if (
      entry.orderId
      && entry.currency === "CHF"
      && entry.amount !== null
      && includesPattern(normalizeHeader(entry.description), DESCRIPTION_PATTERNS.internal)
    ) {
      chfConversionByOrderId.set(entry.orderId, Math.abs(entry.amount));
    }
  });

  accountRecords.forEach(({ record, rowNumber, occurredAt, description, amount, currency, orderId }) => {
    const trade = parseAccountTrade(description);
    const type = trade?.type ?? (amount === null ? null : classifyAccountRow(description, amount));
    if (!occurredAt || amount === null || amount === 0 || !type) {
      ignoredRows += 1;
      return;
    }

    const totalValue = Math.abs(amount);
    const transactionCurrency = trade?.currency ?? currency;
    if (trade && transactionCurrency !== currency) {
      warnings.push(`Row ${rowNumber} was skipped because its trade and cash currencies do not match.`);
      ignoredRows += 1;
      return;
    }
    const convertedValueChf = orderId ? chfConversionByOrderId.get(orderId) : undefined;
    const fxRateToChf = transactionCurrency === "CHF"
      ? 1
      : trade && convertedValueChf
        ? convertedValueChf / totalValue
        : options.accountToChfRate;
    const product = cell(record, columns.product);
    const isin = cell(record, columns.isin).toUpperCase();
    rows.push({
      rowNumber,
      externalId: orderId || null,
      occurredAt,
      type,
      product: product || null,
      isin: isin || null,
      brokerSymbol: makeBrokerSymbol("", isin, product),
      quantity: trade?.quantity ?? null,
      executionPrice: trade?.executionPrice ?? null,
      transactionCurrency,
      fxRateToChf,
      fee: type === "FEE" ? totalValue : 0,
      feeChf: type === "FEE" ? totalValue * fxRateToChf : 0,
      totalValue,
      totalValueChf: totalValue * fxRateToChf,
      notes: `${description} · DEGIRO account statement row ${rowNumber}`,
    });
  });

  return { kind: "account", rows, ignoredRows, warnings };
}

export function parseDegiroCsv(text: string, options: DegiroParseOptions): DegiroParseResult {
  if (!text.trim()) throw new Error("The selected CSV is empty.");
  const matrix = parseCsv(text);
  if (matrix.length < 2) throw new Error("The selected CSV has no data rows.");
  const headers = matrix[0];
  const accountBaseCurrency = normalizeCurrency(options.accountBaseCurrency, "CHF");
  const accountToChfRate = options.accountToChfRate ?? (accountBaseCurrency === "CHF" ? 1 : 0);
  if (!Number.isFinite(accountToChfRate) || accountToChfRate <= 0) {
    throw new Error(`Enter a positive ${accountBaseCurrency}/CHF rate before importing.`);
  }
  const resolvedOptions = { accountBaseCurrency, accountToChfRate };

  if (findColumn(headers, HEADER_ALIASES.quantity) >= 0 && findColumn(headers, HEADER_ALIASES.price) >= 0) {
    return transactionStatement(matrix, resolvedOptions);
  }
  if (findColumn(headers, HEADER_ALIASES.description) >= 0 && findColumn(headers, HEADER_ALIASES.change) >= 0) {
    return accountStatement(matrix, resolvedOptions);
  }
  throw new Error("Unsupported DEGIRO CSV. Export either the Transaction statement or Account statement in CSV format.");
}
