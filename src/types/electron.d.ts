import type {
  accountReconciliations,
  accounts,
  budgetAllocations,
  budgetTransfers,
  categories,
  envelopeCategories,
  envelopes,
  payees,
  scheduledTransactions,
  settings,
  transactions,
} from "@/main/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type SyncMetadataFields = "publicId" | "updatedAt" | "deletedAt";
type OptionalSyncMetadata = {
  publicId?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};
type WithOptionalSyncMetadata<T> = Omit<T, SyncMetadataFields> &
  OptionalSyncMetadata;
export type Account = WithOptionalSyncMetadata<
  InferSelectModel<typeof accounts>
>;
export type AccountReconciliation = WithOptionalSyncMetadata<
  InferSelectModel<typeof accountReconciliations>
>;
export type AccountWithBalances = Account & {
  computedBalance: number;
  clearedBalance: number;
  lastReconcileDate: string | null;
  lastReconcileBalance: number | null;
};
export type Category = WithOptionalSyncMetadata<
  InferSelectModel<typeof categories>
>;
export type Transaction = WithOptionalSyncMetadata<
  InferSelectModel<typeof transactions>
>;
export type ScheduledTransaction = WithOptionalSyncMetadata<
  InferSelectModel<typeof scheduledTransactions>
>;
export type Settings = InferSelectModel<typeof settings>;
export type Payee = WithOptionalSyncMetadata<InferSelectModel<typeof payees>>;
export type Envelope = WithOptionalSyncMetadata<
  InferSelectModel<typeof envelopes>
>;
export type EnvelopeCategory = WithOptionalSyncMetadata<
  InferSelectModel<typeof envelopeCategories>
>;
export type BudgetAllocation = WithOptionalSyncMetadata<
  InferSelectModel<typeof budgetAllocations>
>;
export type BudgetTransfer = WithOptionalSyncMetadata<
  InferSelectModel<typeof budgetTransfers>
>;
export type AccountShortcut = {
  key: string;
  ctrl?: boolean;
  accountId: number;
};

export type Preferences = {
  hideReconciled: boolean;
  hideCleared: boolean;
  backupFolder?: string;
  backupRetentionDays?: number;
  autofillPayees: boolean;
  theme?: "light" | "dark" | "auto";
  startupPage?: string;
  accountShortcuts?: AccountShortcut[];
};

export type BackupInfo = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
};

export interface ApplicationAPI {
  getAccounts: () => Promise<AccountWithBalances[]>;
  getAccount: (id: number) => Promise<AccountWithBalances | null>;
  createAccount: (
    data: Omit<Account, "id" | "createdAt" | "deleted" | SyncMetadataFields>,
  ) => Promise<Account[]>;
  updateAccount: (
    id: number,
    data: Partial<
      Omit<Account, "id" | "createdAt" | "deleted" | SyncMetadataFields>
    >,
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
    data: Omit<AccountReconciliation, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<AccountReconciliation[]>;
  updateAccountReconciliation: (
    id: number,
    data: Partial<
      Omit<AccountReconciliation, "id" | "createdAt" | SyncMetadataFields>
    >,
  ) => Promise<AccountReconciliation[]>;
  deleteAccountReconciliation: (id: number) => Promise<void>;

  getCategories: () => Promise<Category[]>;
  getCategory: (id: number) => Promise<Category | null>;
  createCategory: (
    data: Omit<Category, "id" | "createdAt" | "deleted" | SyncMetadataFields>,
  ) => Promise<Category[]>;
  updateCategory: (
    id: number,
    data: Partial<
      Omit<Category, "id" | "createdAt" | "deleted" | SyncMetadataFields>
    >,
  ) => Promise<Category[]>;
  deleteCategory: (id: number) => Promise<void>;

  getTransactions: () => Promise<Transaction[]>;
  getTransaction: (id: number) => Promise<Transaction | null>;
  getTransactionsByAccount: (accountId: number) => Promise<Transaction[]>;
  getTransactionsByDateRange: (
    startDate: string,
    endDate: string,
    accountIds?: number[],
  ) => Promise<Transaction[]>;
  createTransaction: (
    data: Omit<
      Transaction,
      | "id"
      | "createdAt"
      | "reconciled"
      | "transferTransactionId"
      | SyncMetadataFields
    >,
  ) => Promise<Transaction[]>;
  updateTransaction: (
    id: number,
    data: Partial<
      Omit<
        Transaction,
        "id" | "createdAt" | "transferTransactionId" | SyncMetadataFields
      >
    >,
  ) => Promise<Transaction[]>;
  deleteTransaction: (id: number) => Promise<void>;
  reconcileTransactions: (payload: {
    toReconcile: number[];
    toUnclear: number[];
    checkpoint: Omit<
      AccountReconciliation,
      "id" | "createdAt" | SyncMetadataFields
    >;
  }) => Promise<AccountReconciliation[]>;

  getScheduledTransactions: () => Promise<ScheduledTransaction[]>;
  getScheduledTransaction: (id: number) => Promise<ScheduledTransaction | null>;
  createScheduledTransaction: (
    data: Omit<ScheduledTransaction, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<ScheduledTransaction[]>;
  updateScheduledTransaction: (
    id: number,
    data: Partial<
      Omit<ScheduledTransaction, "id" | "createdAt" | SyncMetadataFields>
    >,
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

  getDataFolder: () => Promise<string>;
  moveDataFolder: (newFolder: string) => Promise<void>;
  chooseDataFolder: () => Promise<string | null>;

  chooseQifFile: () => Promise<string | null>;
  readQifFile: (filePath: string) => Promise<string>;

  getPayees: () => Promise<Payee[]>;
  getPayee: (id: number) => Promise<Payee | null>;
  createPayee: (
    data: Omit<Payee, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<Payee[]>;
  updatePayee: (
    id: number,
    data: Partial<Omit<Payee, "id" | "createdAt" | SyncMetadataFields>>,
  ) => Promise<Payee[]>;
  deletePayee: (id: number) => Promise<void>;
  upsertPayee: (
    name: string,
    categoryId: number | null,
    amount: number | null,
  ) => Promise<Payee[]>;

  // Envelopes
  getEnvelopes: () => Promise<Envelope[]>;
  getAllEnvelopesIncludingInactive: () => Promise<Envelope[]>;
  getEnvelope: (id: number) => Promise<Envelope | null>;
  createEnvelope: (
    data: Omit<Envelope, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<Envelope[]>;
  updateEnvelope: (
    id: number,
    data: Partial<Omit<Envelope, "id" | "createdAt" | SyncMetadataFields>>,
  ) => Promise<Envelope[]>;
  deleteEnvelope: (id: number) => Promise<Envelope[]>;
  reorderEnvelopes: (
    updates: Array<{ id: number; sortOrder: number }>,
  ) => Promise<void>;

  // Envelope-category mappings
  getEnvelopeCategories: () => Promise<EnvelopeCategory[]>;
  getEnvelopeCategoriesByEnvelope: (
    envelopeId: number,
  ) => Promise<EnvelopeCategory[]>;
  createEnvelopeCategory: (
    data: Omit<EnvelopeCategory, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<EnvelopeCategory[]>;
  deleteEnvelopeCategory: (id: number) => Promise<void>;
  deleteEnvelopeCategoriesByEnvelope: (envelopeId: number) => Promise<void>;

  // Budget allocations
  getBudgetAllocations: () => Promise<BudgetAllocation[]>;
  getBudgetAllocationsByMonth: (month: string) => Promise<BudgetAllocation[]>;
  upsertBudgetAllocation: (
    envelopeId: number,
    month: string,
    assigned: number,
  ) => Promise<BudgetAllocation[]>;
  quickFillAllocations: (
    targetMonth: string,
    sourceMonth: string,
  ) => Promise<BudgetAllocation[]>;
  deleteBudgetAllocation: (id: number) => Promise<void>;

  // Auto-update
  onUpdateAvailable: (callback: (version: string) => void) => void;
  onUpdateDownloaded: (callback: (version: string) => void) => void;
  onUpdateNotAvailable: (callback: () => void) => void;
  checkForUpdates: () => Promise<void>;
  restartToUpdate: () => void;
  openExternal: (url: string) => Promise<void>;

  // Budget transfers
  getBudgetTransfers: () => Promise<BudgetTransfer[]>;
  getBudgetTransfersByMonth: (month: string) => Promise<BudgetTransfer[]>;
  createBudgetTransfer: (
    data: Omit<BudgetTransfer, "id" | "createdAt" | SyncMetadataFields>,
  ) => Promise<BudgetTransfer[]>;
  deleteBudgetTransfer: (id: number) => Promise<void>;
}

declare global {
  interface Window {
    api: ApplicationAPI;
  }
}
