import type {
  accountReconciliations,
  accounts,
  categories,
  payees,
  scheduledTransactions,
  settings,
  transactions,
} from "@/main/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type Account = InferSelectModel<typeof accounts>;
export type AccountReconciliation = InferSelectModel<
  typeof accountReconciliations
>;
export type AccountWithBalances = Account & {
  computedBalance: number;
  clearedBalance: number;
  lastReconcileDate: string | null;
  lastReconcileBalance: number | null;
};
export type Category = InferSelectModel<typeof categories>;
export type Transaction = InferSelectModel<typeof transactions>;
export type ScheduledTransaction = InferSelectModel<
  typeof scheduledTransactions
>;
export type Settings = InferSelectModel<typeof settings>;
export type Payee = InferSelectModel<typeof payees>;
export type Preferences = {
  hideReconciled: boolean;
  hideCleared: boolean;
  backupFolder?: string;
  autofillPayees: boolean;
};

export type BackupInfo = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
};

interface ElectronAPI {
  getAccounts: () => Promise<AccountWithBalances[]>;
  getAccount: (id: number) => Promise<AccountWithBalances | null>;
  createAccount: (
    data: Omit<Account, "id" | "createdAt">,
  ) => Promise<Account[]>;
  updateAccount: (
    id: number,
    data: Partial<Omit<Account, "id" | "createdAt">>,
  ) => Promise<Account[]>;
  deleteAccount: (id: number) => Promise<void>;

  getAccountReconciliations: () => Promise<AccountReconciliation[]>;
  getAccountReconciliationsByAccount: (
    accountId: number,
  ) => Promise<AccountReconciliation[]>;
  getAccountReconciliation: (
    id: number,
  ) => Promise<AccountReconciliation | null>;
  createAccountReconciliation: (
    data: Omit<AccountReconciliation, "id" | "createdAt">,
  ) => Promise<AccountReconciliation[]>;
  updateAccountReconciliation: (
    id: number,
    data: Partial<Omit<AccountReconciliation, "id" | "createdAt">>,
  ) => Promise<AccountReconciliation[]>;
  deleteAccountReconciliation: (id: number) => Promise<void>;

  getCategories: () => Promise<Category[]>;
  getCategory: (id: number) => Promise<Category | null>;
  createCategory: (
    data: Omit<Category, "id" | "createdAt" | "deleted">,
  ) => Promise<Category[]>;
  updateCategory: (
    id: number,
    data: Partial<Omit<Category, "id" | "createdAt" | "deleted">>,
  ) => Promise<Category[]>;
  deleteCategory: (id: number) => Promise<void>;

  getTransactions: () => Promise<Transaction[]>;
  getTransaction: (id: number) => Promise<Transaction | null>;
  getTransactionsByAccount: (accountId: number) => Promise<Transaction[]>;
  createTransaction: (
    data: Omit<
      Transaction,
      "id" | "createdAt" | "reconciled" | "transferTransactionId"
    >,
  ) => Promise<Transaction[]>;
  updateTransaction: (
    id: number,
    data: Partial<
      Omit<Transaction, "id" | "createdAt" | "transferTransactionId">
    >,
  ) => Promise<Transaction[]>;
  deleteTransaction: (id: number) => Promise<void>;
  reconcileTransactions: (payload: {
    toReconcile: number[];
    toUnclear: number[];
    checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
  }) => Promise<AccountReconciliation[]>;

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

  getSettings: () => Promise<Settings[]>;
  getSetting: (id: number) => Promise<Settings | null>;
  createSetting: (data: Omit<Settings, "id">) => Promise<Settings[]>;
  updateSetting: (
    id: number,
    data: Partial<Omit<Settings, "id">>,
  ) => Promise<Settings[]>;
  deleteSetting: (id: number) => Promise<void>;
  getPreferences: () => Promise<Preferences>;
  setPreferences: (prefs: Preferences) => Promise<Settings[]>;

  getDefaultBackupFolder: () => Promise<string>;
  createBackup: (folder?: string) => Promise<{ path: string }>;
  listBackups: (folder?: string) => Promise<BackupInfo[]>;
  deleteBackup: (filePath: string) => Promise<void>;
  restoreBackup: (filePath: string) => Promise<void>;
  chooseBackupFolder: () => Promise<string | null>;
  chooseBackupFile: (folder?: string) => Promise<string | null>;

  getPayees: () => Promise<Payee[]>;
  getPayee: (id: number) => Promise<Payee | null>;
  createPayee: (data: Omit<Payee, "id" | "createdAt">) => Promise<Payee[]>;
  updatePayee: (
    id: number,
    data: Partial<Omit<Payee, "id" | "createdAt">>,
  ) => Promise<Payee[]>;
  deletePayee: (id: number) => Promise<void>;
  upsertPayee: (
    name: string,
    categoryId: number | null,
    amount: number | null,
  ) => Promise<Payee[]>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
