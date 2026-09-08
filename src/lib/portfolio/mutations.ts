import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

// A ledger change affects every later valuation, including per-security series.
// Keep earlier history; stale points can be reconstructed on the next import.
export async function invalidatePortfolioHistory(tx: Prisma.TransactionClient, from?: Date) {
  const where = from ? { timestamp: { gte: from } } : {};
  await tx.securitySnapshot.deleteMany({ where });
  await tx.portfolioSnapshot.deleteMany({ where });
}

export function revalidatePortfolioViews() {
  revalidatePath("/", "layout");
}
