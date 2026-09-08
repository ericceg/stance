import type { AccountingTransaction, TransactionType } from "./types";

const EPSILON = 1e-9;

export type FeeCategory = "TRADING" | "INCOME" | "ACCOUNT";

export const feeCategoryLabels: Record<FeeCategory, string> = {
  TRADING: "Trading fees",
  INCOME: "Income charges",
  ACCOUNT: "Account fees",
};

export function getFeeCategory(type: TransactionType): FeeCategory {
  if (type === "FEE") return "ACCOUNT";
  if (type === "DIVIDEND") return "INCOME";
  return "TRADING";
}

export function getFeeAmountChf(transaction: Pick<AccountingTransaction, "type" | "feeChf" | "totalValueChf">) {
  return transaction.type === "FEE" ? transaction.totalValueChf : transaction.feeChf;
}

export interface FeeSummary {
  totalChf: number;
  entryCount: number;
  tradeVolumeChf: number;
  tradeFeeChf: number;
  effectiveTradeFeePercent: number | null;
  trailingTwelveMonthsChf: number;
  categories: Array<{ category: FeeCategory; amountChf: number; count: number }>;
  months: Array<{ key: string; label: string; amountChf: number }>;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-CH", { month: "short" }).format(date);
}

export function buildFeeSummary(transactions: AccountingTransaction[], now = new Date()): FeeSummary {
  const feeTransactions = transactions
    .map((transaction) => ({ transaction, amountChf: getFeeAmountChf(transaction) }))
    .filter(({ amountChf }) => Number.isFinite(amountChf) && amountChf > EPSILON);
  const categoryTotals = new Map<FeeCategory, { amountChf: number; count: number }>();
  const monthTotals = new Map<string, number>();
  const trailingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  for (const { transaction, amountChf } of feeTransactions) {
    const category = getFeeCategory(transaction.type);
    const currentCategory = categoryTotals.get(category) ?? { amountChf: 0, count: 0 };
    currentCategory.amountChf += amountChf;
    currentCategory.count += 1;
    categoryTotals.set(category, currentCategory);

    if (transaction.timestamp >= trailingStart) {
      const key = monthKey(transaction.timestamp);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + amountChf);
    }
  }

  const categories = (Object.keys(feeCategoryLabels) as FeeCategory[])
    .map((category) => ({ category, ...(categoryTotals.get(category) ?? { amountChf: 0, count: 0 }) }))
    .filter((item) => item.amountChf > EPSILON)
    .sort((left, right) => right.amountChf - left.amountChf);

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    const key = monthKey(date);
    return { key, label: monthLabel(date), amountChf: monthTotals.get(key) ?? 0 };
  });
  const tradeVolumeChf = transactions.reduce((total, transaction) => (
    transaction.type === "BUY" || transaction.type === "SELL" ? total + transaction.totalValueChf : total
  ), 0);
  const tradeFeeChf = categories.find((item) => item.category === "TRADING")?.amountChf ?? 0;

  return {
    totalChf: feeTransactions.reduce((total, item) => total + item.amountChf, 0),
    entryCount: feeTransactions.length,
    tradeVolumeChf,
    tradeFeeChf,
    effectiveTradeFeePercent: tradeVolumeChf > EPSILON ? (tradeFeeChf / tradeVolumeChf) * 100 : null,
    trailingTwelveMonthsChf: months.reduce((total, month) => total + month.amountChf, 0),
    categories,
    months,
  };
}
