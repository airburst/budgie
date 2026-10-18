import { createAccountReconciliationService } from "@/services/account-reconciliations";
import { createAccountService } from "@/services/accounts";
import { createBudgetService } from "@/services/budgets";
import { createCategoryService } from "@/services/categories";
import { createEnvelopeService } from "@/services/envelopes";
import { createPayeeService } from "@/services/payees";
import {
  createPortableData,
  importPortableData,
  parsePortableData,
  serializePortableData,
} from "@/services/portable-data";
import { createReconciliationService } from "@/services/reconciliation";
import { createScheduledTransactionService } from "@/services/scheduled-transactions";
import { createSettingsService } from "@/services/settings";
import { createTransactionService } from "@/services/transactions";
import type { ApplicationAPI } from "@/types/electron";
import type { BrowserDatabase } from "@/web/db/browser-database";

const unsupported = (operation: string): never => {
  throw new Error(`${operation} is unavailable in the browser runtime`);
};

export const createBrowserApplicationApi = (
  database: BrowserDatabase,
): ApplicationAPI => {
  const accounts = createAccountService(database);
  const reconciliations = createAccountReconciliationService(database);
  const categories = createCategoryService(database);
  const transactions = createTransactionService(database);
  const scheduled = createScheduledTransactionService(database);
  const settings = createSettingsService(database);
  const payees = createPayeeService(database);
  const envelopes = createEnvelopeService(database);
  const budgets = createBudgetService(database);
  const reconciliation = createReconciliationService(database);

  return {
    getAccounts: accounts.getAll,
    getAccount: accounts.getById,
    createAccount: accounts.create,
    updateAccount: accounts.update,
    deleteAccount: accounts.delete,
    getAccountReconciliations: reconciliations.getAll,
    getAccountReconciliationsByAccount: reconciliations.getByAccount,
    getAccountReconciliation: reconciliations.getById,
    createAccountReconciliation: reconciliations.create,
    updateAccountReconciliation: reconciliations.update,
    deleteAccountReconciliation: reconciliations.delete,
    getCategories: categories.getAll,
    getCategory: categories.getById,
    createCategory: categories.create,
    updateCategory: categories.update,
    deleteCategory: categories.delete,
    getTransactions: transactions.getAll,
    getTransaction: transactions.getById,
    getTransactionsByAccount: transactions.getByAccount,
    getTransactionsByDateRange: transactions.getByDateRange,
    createTransaction: transactions.create,
    updateTransaction: transactions.update,
    deleteTransaction: transactions.delete,
    reconcileTransactions: reconciliation.reconcile,
    getScheduledTransactions: scheduled.getAll,
    getScheduledTransaction: scheduled.getById,
    createScheduledTransaction: scheduled.create,
    updateScheduledTransaction: scheduled.update,
    deleteScheduledTransaction: scheduled.delete,
    getSettings: settings.getAll,
    getSetting: settings.getById,
    createSetting: settings.create,
    updateSetting: settings.update,
    deleteSetting: settings.delete,
    getPreferences: settings.getPreferences,
    setPreferences: settings.setPreferences,
    exportPortableData: async () =>
      serializePortableData(
        await createPortableData(database, {
          applicationVersion: "0.16.3",
          minimumReaderVersion: "0.16.3",
        }),
      ),
    importPortableData: (document) =>
      parsePortableData(document).then((data) =>
        importPortableData(database, data),
      ),
    getPayees: payees.getAll,
    getPayee: payees.getById,
    createPayee: payees.create,
    updatePayee: payees.update,
    deletePayee: payees.delete,
    upsertPayee: payees.upsert,
    getEnvelopes: envelopes.getAll,
    getAllEnvelopesIncludingInactive: envelopes.getAllIncludingInactive,
    getEnvelope: envelopes.getById,
    createEnvelope: envelopes.create,
    updateEnvelope: envelopes.update,
    deleteEnvelope: envelopes.delete,
    reorderEnvelopes: envelopes.reorder,
    getEnvelopeCategories: envelopes.getCategories,
    getEnvelopeCategoriesByEnvelope: envelopes.getCategoriesByEnvelope,
    createEnvelopeCategory: envelopes.createCategory,
    deleteEnvelopeCategory: envelopes.deleteCategory,
    deleteEnvelopeCategoriesByEnvelope: envelopes.deleteCategoriesByEnvelope,
    getBudgetAllocations: budgets.getAllocations,
    getBudgetAllocationsByMonth: budgets.getAllocationsByMonth,
    upsertBudgetAllocation: budgets.upsertAllocation,
    quickFillAllocations: budgets.quickFillAllocations,
    deleteBudgetAllocation: budgets.deleteAllocation,
    getBudgetTransfers: budgets.getTransfers,
    getBudgetTransfersByMonth: budgets.getTransfersByMonth,
    createBudgetTransfer: budgets.createTransfer,
    deleteBudgetTransfer: budgets.deleteTransfer,
    getDefaultBackupFolder: () => unsupported("Backups"),
    createBackup: () => unsupported("Backups"),
    listBackups: () => unsupported("Backups"),
    deleteBackup: () => unsupported("Backups"),
    restoreBackup: () => unsupported("Backups"),
    chooseBackupFolder: () => unsupported("Backups"),
    chooseBackupFile: () => unsupported("Backups"),
    getDataFolder: () => unsupported("Filesystem data folders"),
    moveDataFolder: () => unsupported("Filesystem data folders"),
    chooseDataFolder: () => unsupported("Filesystem data folders"),
    chooseQifFile: () => unsupported("QIF import"),
    readQifFile: () => unsupported("QIF import"),
    onUpdateAvailable: () => undefined,
    onUpdateDownloaded: () => undefined,
    onUpdateNotAvailable: () => undefined,
    checkForUpdates: async () => undefined,
    restartToUpdate: () => undefined,
    openExternal: async () => unsupported("External links"),
  };
};
