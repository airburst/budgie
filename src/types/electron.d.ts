import type {
  accounts,
  categories,
  scheduledTransactions,
  transactions,
} from "@/main/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type Account = InferSelectModel<typeof accounts>;
export type Category = InferSelectModel<typeof categories>;
export type Transaction = InferSelectModel<typeof transactions>;
export type ScheduledTransaction = InferSelectModel<
  typeof scheduledTransactions
>;

interface ElectronAPI {
  getAccounts: () => Promise<Account[]>;
  getAccount: (id: number) => Promise<Account | null>;
  createAccount: (
    data: Omit<Account, "id" | "createdAt">,
  ) => Promise<Account[]>;
  updateAccount: (
    id: number,
    data: Partial<Omit<Account, "id" | "createdAt">>,
  ) => Promise<Account[]>;
  deleteAccount: (id: number) => Promise<void>;

  getCategories: () => Promise<Category[]>;
  getCategory: (id: number) => Promise<Category | null>;
  createCategory: (
    data: Omit<Category, "id" | "createdAt">,
  ) => Promise<Category[]>;
  updateCategory: (
    id: number,
    data: Partial<Omit<Category, "id" | "createdAt">>,
  ) => Promise<Category[]>;
  deleteCategory: (id: number) => Promise<void>;

  getTransactions: () => Promise<Transaction[]>;
  getTransaction: (id: number) => Promise<Transaction | null>;
  getTransactionsByAccount: (accountId: number) => Promise<Transaction[]>;
  createTransaction: (
    data: Omit<Transaction, "id" | "createdAt">,
  ) => Promise<Transaction[]>;
  updateTransaction: (
    id: number,
    data: Partial<Omit<Transaction, "id" | "createdAt">>,
  ) => Promise<Transaction[]>;
  deleteTransaction: (id: number) => Promise<void>;

  getScheduledTransactions: () => Promise<ScheduledTransaction[]>;
  getScheduledTransaction: (id: number) => Promise<ScheduledTransaction | null>;
  createScheduledTransaction: (
    data: Omit<ScheduledTransaction, "id" | "createdAt">,
  ) => Promise<ScheduledTransaction[]>;
  updateScheduledTransaction: (
    id: number,
    data: Partial<Omit<ScheduledTransaction, "id" | "createdAt">>,
  ) => Promise<ScheduledTransaction[]>;
  deleteScheduledTransaction: (id: number) => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
