type AccountType = "bank" | "credit_card" | "loan" | "investment" | "cash";

// Matches databse schema as of 2026-03-06
export type Account = {
  id: number;
  name: string;
  number: string | null;
  type: AccountType;
  balance: number;
  currency: string;
  notes: string | null;
  createdAt: string | null;
};
