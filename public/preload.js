const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getAccounts: () => ipcRenderer.invoke("accounts:getAll"),
  getAccount: (id) => ipcRenderer.invoke("accounts:getById", id),
  createAccount: (data) => ipcRenderer.invoke("accounts:create", data),
  updateAccount: (id, data) => ipcRenderer.invoke("accounts:update", id, data),
  deleteAccount: (id) => ipcRenderer.invoke("accounts:delete", id),

  getCategories: () => ipcRenderer.invoke("categories:getAll"),
  getCategory: (id) => ipcRenderer.invoke("categories:getById", id),
  createCategory: (data) => ipcRenderer.invoke("categories:create", data),
  updateCategory: (id, data) =>
    ipcRenderer.invoke("categories:update", id, data),
  deleteCategory: (id) => ipcRenderer.invoke("categories:delete", id),

  getTransactions: () => ipcRenderer.invoke("transactions:getAll"),
  getTransaction: (id) => ipcRenderer.invoke("transactions:getById", id),
  getTransactionsByAccount: (accountId) =>
    ipcRenderer.invoke("transactions:getByAccount", accountId),
  getTransactionsByDateRange: (startDate, endDate, accountIds) =>
    ipcRenderer.invoke(
      "transactions:getByDateRange",
      startDate,
      endDate,
      accountIds,
    ),
  createTransaction: (data) => ipcRenderer.invoke("transactions:create", data),
  updateTransaction: (id, data) =>
    ipcRenderer.invoke("transactions:update", id, data),
  deleteTransaction: (id) => ipcRenderer.invoke("transactions:delete", id),
  reconcileTransactions: (payload) =>
    ipcRenderer.invoke("transactions:reconcile", payload),

  getScheduledTransactions: () =>
    ipcRenderer.invoke("scheduled_transactions:getAll"),
  getScheduledTransaction: (id) =>
    ipcRenderer.invoke("scheduled_transactions:getById", id),
  createScheduledTransaction: (data) =>
    ipcRenderer.invoke("scheduled_transactions:create", data),
  updateScheduledTransaction: (id, data) =>
    ipcRenderer.invoke("scheduled_transactions:update", id, data),
  deleteScheduledTransaction: (id) =>
    ipcRenderer.invoke("scheduled_transactions:delete", id),

  getAccountReconciliations: () =>
    ipcRenderer.invoke("account_reconciliations:getAll"),
  getAccountReconciliationsByAccount: (accountId) =>
    ipcRenderer.invoke("account_reconciliations:getByAccount", accountId),
  getAccountReconciliation: (id) =>
    ipcRenderer.invoke("account_reconciliations:getById", id),
  createAccountReconciliation: (data) =>
    ipcRenderer.invoke("account_reconciliations:create", data),
  updateAccountReconciliation: (id, data) =>
    ipcRenderer.invoke("account_reconciliations:update", id, data),
  deleteAccountReconciliation: (id) =>
    ipcRenderer.invoke("account_reconciliations:delete", id),

  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  getSetting: (id) => ipcRenderer.invoke("settings:getById", id),
  createSetting: (data) => ipcRenderer.invoke("settings:create", data),
  updateSetting: (id, data) => ipcRenderer.invoke("settings:update", id, data),
  deleteSetting: (id) => ipcRenderer.invoke("settings:delete", id),
  getPreferences: () => ipcRenderer.invoke("settings:getPreferences"),
  setPreferences: (prefs) =>
    ipcRenderer.invoke("settings:setPreferences", prefs),

  getDefaultBackupFolder: () => ipcRenderer.invoke("backups:getDefaultFolder"),
  createBackup: (folder) => ipcRenderer.invoke("backups:create", folder),
  listBackups: (folder) => ipcRenderer.invoke("backups:list", folder),
  deleteBackup: (filePath) => ipcRenderer.invoke("backups:delete", filePath),
  restoreBackup: (filePath) => ipcRenderer.invoke("backups:restore", filePath),
  chooseBackupFolder: () => ipcRenderer.invoke("backups:chooseFolder"),
  chooseBackupFile: (folder) =>
    ipcRenderer.invoke("backups:chooseFile", folder),

  getDataFolder: () => ipcRenderer.invoke("settings:getDataFolder"),
  moveDataFolder: (newFolder) =>
    ipcRenderer.invoke("settings:moveDataFolder", newFolder),
  chooseDataFolder: () => ipcRenderer.invoke("settings:chooseDataFolder"),

  chooseQifFile: () => ipcRenderer.invoke("import:chooseQifFile"),
  readQifFile: (filePath) => ipcRenderer.invoke("import:readQifFile", filePath),

  getPayees: () => ipcRenderer.invoke("payees:getAll"),
  getPayee: (id) => ipcRenderer.invoke("payees:getById", id),
  createPayee: (data) => ipcRenderer.invoke("payees:create", data),
  updatePayee: (id, data) => ipcRenderer.invoke("payees:update", id, data),
  deletePayee: (id) => ipcRenderer.invoke("payees:delete", id),
  upsertPayee: (name, categoryId, amount) =>
    ipcRenderer.invoke("payees:upsert", name, categoryId, amount),

  // Envelopes
  getEnvelopes: () => ipcRenderer.invoke("envelopes:getAll"),
  getAllEnvelopesIncludingInactive: () =>
    ipcRenderer.invoke("envelopes:getAllIncludingInactive"),
  getEnvelope: (id) => ipcRenderer.invoke("envelopes:getById", id),
  createEnvelope: (data) => ipcRenderer.invoke("envelopes:create", data),
  updateEnvelope: (id, data) =>
    ipcRenderer.invoke("envelopes:update", id, data),
  deleteEnvelope: (id) => ipcRenderer.invoke("envelopes:delete", id),
  reorderEnvelopes: (updates) =>
    ipcRenderer.invoke("envelopes:reorder", updates),

  // Envelope-category mappings
  getEnvelopeCategories: () => ipcRenderer.invoke("envelope_categories:getAll"),
  getEnvelopeCategoriesByEnvelope: (envelopeId) =>
    ipcRenderer.invoke("envelope_categories:getByEnvelope", envelopeId),
  createEnvelopeCategory: (data) =>
    ipcRenderer.invoke("envelope_categories:create", data),
  deleteEnvelopeCategory: (id) =>
    ipcRenderer.invoke("envelope_categories:delete", id),
  deleteEnvelopeCategoriesByEnvelope: (envelopeId) =>
    ipcRenderer.invoke("envelope_categories:deleteByEnvelope", envelopeId),

  // Budget allocations
  getBudgetAllocations: () => ipcRenderer.invoke("budget_allocations:getAll"),
  getBudgetAllocationsByMonth: (month) =>
    ipcRenderer.invoke("budget_allocations:getByMonth", month),
  upsertBudgetAllocation: (envelopeId, month, assigned) =>
    ipcRenderer.invoke(
      "budget_allocations:upsert",
      envelopeId,
      month,
      assigned,
    ),
  quickFillAllocations: (targetMonth, sourceMonth) =>
    ipcRenderer.invoke(
      "budget_allocations:quickFill",
      targetMonth,
      sourceMonth,
    ),
  deleteBudgetAllocation: (id) =>
    ipcRenderer.invoke("budget_allocations:delete", id),

  // Auto-update
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (_, version) => callback(version));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (_, version) => callback(version));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update-not-available", () => callback());
  },
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  restartToUpdate: () => ipcRenderer.send("restart-to-update"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),

  // Budget transfers
  getBudgetTransfers: () => ipcRenderer.invoke("budget_transfers:getAll"),
  getBudgetTransfersByMonth: (month) =>
    ipcRenderer.invoke("budget_transfers:getByMonth", month),
  createBudgetTransfer: (data) =>
    ipcRenderer.invoke("budget_transfers:create", data),
  deleteBudgetTransfer: (id) =>
    ipcRenderer.invoke("budget_transfers:delete", id),
};

contextBridge.exposeInMainWorld("api", api);
