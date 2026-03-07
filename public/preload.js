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
};

contextBridge.exposeInMainWorld("api", api);
