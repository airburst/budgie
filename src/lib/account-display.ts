import type { Account } from "@/types/electron";

const ACCOUNT_TYPE_LABELS: Record<Account["type"], string> = {
  bank: "Bank",
  credit_card: "Credit card",
  loan: "Loan",
  investment: "Investment",
  cash: "Cash",
};

export function accountTypeLabel(type: Account["type"]): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}

/** Last four characters of an account number, e.g. `•• 4821`. */
export function maskAccountNumber(number: string | null | undefined) {
  const compact = number?.replace(/\s+/g, "") ?? "";
  if (!compact) return null;
  return `•• ${compact.slice(-4)}`;
}

/** `Bank · •• 4821`, or just the type when there is no number. */
export function accountSummary(account: Pick<Account, "type" | "number">) {
  const masked = maskAccountNumber(account.number);
  const type = accountTypeLabel(account.type);
  return masked ? `${type} · ${masked}` : type;
}

/**
 * Remaining credit uses the existing overview rule: credit cards with a limit
 * only, limit plus the (negative) computed balance.
 */
export function remainingCredit(
  account: Pick<Account, "type" | "creditLimit"> & { computedBalance: number },
) {
  if (account.type !== "credit_card" || account.creditLimit == null) {
    return null;
  }
  return account.creditLimit + account.computedBalance;
}
