const {
  createAccountService,
  createAccountReconciliationService,
  createCategoryService,
  createBudgetService,
  createEnvelopeService,
  createPayeeService,
  createReconciliationService,
  createSettingsService,
  createScheduledTransactionService,
  createTransactionService,
  createPortableData,
  serializePortableData,
  parsePortableData,
  importPortableData,
} = require("../services.js");

module.exports = function registerSharedServices(ipcMain, database) {
  const accounts = createAccountService(database);
  const reconciliations = createAccountReconciliationService(database);
  const categories = createCategoryService(database);
  const budgets = createBudgetService(database);
  const envelopes = createEnvelopeService(database);
  const transactions = createTransactionService(database);
  const reconciliation = createReconciliationService(database);
  const payees = createPayeeService(database);
  const settings = createSettingsService(database);
  const scheduledTransactions = createScheduledTransactionService(database);

  ipcMain.handle("portable:export", async () =>
    serializePortableData(
      await createPortableData(database, {
        applicationVersion: "0.16.3",
        minimumReaderVersion: "0.16.3",
      }),
    ),
  );
  ipcMain.handle("portable:import", async (_, document) =>
    importPortableData(database, await parsePortableData(document)),
  );

  ipcMain.handle("accounts:getAll", () => accounts.getAll());
  ipcMain.handle("accounts:getById", (_, id) => accounts.getById(id));
  ipcMain.handle("accounts:create", (_, data) => accounts.create(data));
  ipcMain.handle("accounts:update", (_, id, data) => accounts.update(id, data));
  ipcMain.handle("accounts:delete", (_, id) => accounts.delete(id));

  ipcMain.handle("account_reconciliations:getAll", () =>
    reconciliations.getAll(),
  );
  ipcMain.handle("account_reconciliations:getByAccount", (_, id) =>
    reconciliations.getByAccount(id),
  );
  ipcMain.handle("account_reconciliations:getById", (_, id) =>
    reconciliations.getById(id),
  );
  ipcMain.handle("account_reconciliations:create", (_, data) =>
    reconciliations.create(data),
  );
  ipcMain.handle("account_reconciliations:update", (_, id, data) =>
    reconciliations.update(id, data),
  );
  ipcMain.handle("account_reconciliations:delete", (_, id) =>
    reconciliations.delete(id),
  );

  ipcMain.handle("categories:getAll", () => categories.getAll());
  ipcMain.handle("categories:getById", (_, id) => categories.getById(id));
  ipcMain.handle("categories:create", (_, data) => categories.create(data));
  ipcMain.handle("categories:update", (_, id, data) =>
    categories.update(id, data),
  );
  ipcMain.handle("categories:delete", (_, id) => categories.delete(id));

  ipcMain.handle("envelopes:getAll", () => envelopes.getAll());
  ipcMain.handle("envelopes:getAllIncludingInactive", () =>
    envelopes.getAllIncludingInactive(),
  );
  ipcMain.handle("envelopes:getById", (_, id) => envelopes.getById(id));
  ipcMain.handle("envelopes:create", (_, data) => envelopes.create(data));
  ipcMain.handle("envelopes:update", (_, id, data) =>
    envelopes.update(id, data),
  );
  ipcMain.handle("envelopes:delete", (_, id) => envelopes.delete(id));
  ipcMain.handle("envelopes:reorder", (_, updates) =>
    envelopes.reorder(updates),
  );
  ipcMain.handle("envelope_categories:getAll", () => envelopes.getCategories());
  ipcMain.handle("envelope_categories:getByEnvelope", (_, id) =>
    envelopes.getCategoriesByEnvelope(id),
  );
  ipcMain.handle("envelope_categories:create", (_, data) =>
    envelopes.createCategory(data),
  );
  ipcMain.handle("envelope_categories:delete", (_, id) =>
    envelopes.deleteCategory(id),
  );
  ipcMain.handle("envelope_categories:deleteByEnvelope", (_, id) =>
    envelopes.deleteCategoriesByEnvelope(id),
  );

  ipcMain.handle("budget_allocations:getAll", () => budgets.getAllocations());
  ipcMain.handle("budget_allocations:getByMonth", (_, month) =>
    budgets.getAllocationsByMonth(month),
  );
  ipcMain.handle(
    "budget_allocations:upsert",
    (_, envelopeId, month, assigned) =>
      budgets.upsertAllocation(envelopeId, month, assigned),
  );
  ipcMain.handle(
    "budget_allocations:quickFill",
    (_, targetMonth, sourceMonth) =>
      budgets.quickFillAllocations(targetMonth, sourceMonth),
  );
  ipcMain.handle("budget_allocations:delete", (_, id) =>
    budgets.deleteAllocation(id),
  );
  ipcMain.handle("budget_transfers:getAll", () => budgets.getTransfers());
  ipcMain.handle("budget_transfers:getByMonth", (_, month) =>
    budgets.getTransfersByMonth(month),
  );
  ipcMain.handle("budget_transfers:create", (_, data) =>
    budgets.createTransfer(data),
  );
  ipcMain.handle("budget_transfers:delete", (_, id) =>
    budgets.deleteTransfer(id),
  );

  ipcMain.handle("transactions:getAll", () => transactions.getAll());
  ipcMain.handle("transactions:getById", (_, id) => transactions.getById(id));
  ipcMain.handle("transactions:getByAccount", (_, accountId) =>
    transactions.getByAccount(accountId),
  );
  ipcMain.handle("transactions:create", (_, data) => transactions.create(data));
  ipcMain.handle("transactions:update", (_, id, data) =>
    transactions.update(id, data),
  );
  ipcMain.handle("transactions:delete", (_, id) => transactions.delete(id));
  ipcMain.handle("transactions:reconcile", (_, payload) =>
    reconciliation.reconcile(payload),
  );
  ipcMain.handle(
    "transactions:getByDateRange",
    (_, startDate, endDate, accountIds) =>
      database.query({
        sql: `SELECT * FROM transactions WHERE date >= ? AND date <= ?${accountIds?.length ? ` AND account_id IN (${accountIds.map(() => "?").join(", ")})` : ""} ORDER BY date ASC`,
        params: [startDate, endDate, ...(accountIds?.length ? accountIds : [])],
      }),
  );
  ipcMain.handle("payees:getAll", () => payees.getAll());
  ipcMain.handle("payees:getById", (_, id) => payees.getById(id));
  ipcMain.handle("payees:create", (_, data) => payees.create(data));
  ipcMain.handle("payees:update", (_, id, data) => payees.update(id, data));
  ipcMain.handle("payees:delete", (_, id) => payees.delete(id));
  ipcMain.handle("payees:upsert", (_, name, categoryId, amount) =>
    payees.upsert(name, categoryId ?? null, amount ?? null),
  );

  ipcMain.handle("settings:getAll", () => settings.getAll());
  ipcMain.handle("settings:getById", (_, id) => settings.getById(id));
  ipcMain.handle("settings:create", (_, data) => settings.create(data));
  ipcMain.handle("settings:update", (_, id, data) => settings.update(id, data));
  ipcMain.handle("settings:delete", (_, id) => settings.delete(id));
  ipcMain.handle("settings:getPreferences", () => settings.getPreferences());
  ipcMain.handle("settings:setPreferences", (_, prefs) =>
    settings.setPreferences(prefs),
  );

  ipcMain.handle("scheduled_transactions:getAll", () =>
    scheduledTransactions.getAll(),
  );
  ipcMain.handle("scheduled_transactions:getById", (_, id) =>
    scheduledTransactions.getById(id),
  );
  ipcMain.handle("scheduled_transactions:create", (_, data) =>
    scheduledTransactions.create(data),
  );
  ipcMain.handle("scheduled_transactions:update", (_, id, data) =>
    scheduledTransactions.update(id, data),
  );
  ipcMain.handle("scheduled_transactions:delete", (_, id) =>
    scheduledTransactions.delete(id),
  );
};
