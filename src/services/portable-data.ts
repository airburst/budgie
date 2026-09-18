import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseTransaction,
} from "@/platform/database";
import type { Preferences } from "@/types/electron";

export const PORTABLE_FORMAT_VERSION = 1;

type SyncFields = {
  publicId: string;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
};

export type PortableAccount = SyncFields & {
  name: string;
  number: string | null;
  type: string;
  balance: number;
  currency: string;
  notes: string | null;
  interestRate: number | null;
  creditLimit: number | null;
  deleted: boolean;
  pendingReconcileBalance: number | null;
  pendingReconcileDate: string | null;
};

export type PortableCategory = SyncFields & {
  parentPublicId: string | null;
  name: string;
  expenseType: string;
  deleted: boolean;
};

export type PortableTransaction = SyncFields & {
  accountPublicId: string;
  categoryPublicId: string | null;
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  cleared: boolean;
  reconciled: boolean;
  transferTransactionPublicId: string | null;
};

export type PortableAccountReconciliation = SyncFields & {
  accountPublicId: string;
  date: string;
  balance: number;
  notes: string | null;
};

export type PortableScheduledTransaction = SyncFields & {
  accountPublicId: string;
  categoryPublicId: string | null;
  payee: string;
  amount: number;
  rrule: string;
  nextDueDate: string | null;
  autoPost: boolean;
  daysInAdvance: number | null;
  notes: string | null;
  active: boolean;
  transferToAccountPublicId: string | null;
};

export type PortablePayee = SyncFields & {
  name: string;
  categoryPublicId: string | null;
  amount: number | null;
};

export type PortableEnvelope = SyncFields & {
  name: string;
  active: boolean;
  sortOrder: number;
};

export type PortableEnvelopeCategory = SyncFields & {
  envelopePublicId: string;
  categoryPublicId: string;
};

export type PortableBudgetAllocation = SyncFields & {
  envelopePublicId: string;
  month: string;
  assigned: number;
};

export type PortableBudgetTransfer = SyncFields & {
  fromEnvelopePublicId: string;
  toEnvelopePublicId: string;
  month: string;
  amount: number;
  notes: string | null;
};

export type PortableAccountShortcut = Omit<
  NonNullable<Preferences["accountShortcuts"]>[number],
  "accountId"
> & { accountPublicId: string };

export type PortablePreferences = Omit<Preferences, "accountShortcuts"> & {
  accountShortcuts?: PortableAccountShortcut[];
};

export type PortableData = {
  manifest: {
    formatVersion: typeof PORTABLE_FORMAT_VERSION;
    applicationVersion: string;
    exportedAt: string;
    minimumReaderVersion: string;
    checksum: string;
  };
  preferences: PortablePreferences;
  accounts: PortableAccount[];
  categories: PortableCategory[];
  transactions: PortableTransaction[];
  accountReconciliations: PortableAccountReconciliation[];
  scheduledTransactions: PortableScheduledTransaction[];
  payees: PortablePayee[];
  envelopes: PortableEnvelope[];
  envelopeCategories: PortableEnvelopeCategory[];
  budgetAllocations: PortableBudgetAllocation[];
  budgetTransfers: PortableBudgetTransfer[];
};

export type PortableExportOptions = {
  applicationVersion: string;
  minimumReaderVersion: string;
  exportedAt?: string;
};

type Row = DatabaseRow & {
  id: number;
  public_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type RowValue = DatabaseRow[string] | undefined;

const asString = (value: RowValue, field: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  return value;
};

const asNullableString = (value: RowValue): string | null =>
  typeof value === "string" ? value : null;

const asNumber = (value: RowValue, field: string): number => {
  if (typeof value !== "number") throw new Error(`Invalid ${field}`);
  return value;
};

const asNullableNumber = (value: RowValue): number | null =>
  typeof value === "number" ? value : null;

const asBoolean = (value: RowValue, field: string): boolean => {
  if (typeof value !== "number" && typeof value !== "boolean") {
    throw new Error(`Invalid ${field}`);
  }
  return Boolean(value);
};

const syncFields = (row: Row): SyncFields => ({
  publicId: asString(row.public_id, "public_id"),
  createdAt: asNullableString(row.created_at),
  updatedAt: asNullableString(row.updated_at),
  deletedAt: asNullableString(row.deleted_at),
});

const publicIds = (rows: Row[]) =>
  new Map(rows.map((row) => [row.id, asString(row.public_id, "public_id")]));

const reference = (ids: Map<number, string>, value: RowValue) =>
  value == null ? null : (ids.get(asNumber(value, "foreign key")) ?? null);

const requiredReference = (
  ids: Map<number, string>,
  value: RowValue,
  field: string,
) => {
  const result = reference(ids, value);
  if (result === null) throw new Error(`Missing ${field} reference`);
  return result;
};

const toPortablePreferences = (
  value: Preferences,
  accountIds: Map<number, string>,
): PortablePreferences => {
  const { accountShortcuts, ...portableValue } = value;
  return {
    ...portableValue,
    ...(accountShortcuts
      ? {
          accountShortcuts: accountShortcuts.map((shortcut) => ({
            key: shortcut.key,
            ...(shortcut.ctrl === undefined ? {} : { ctrl: shortcut.ctrl }),
            accountPublicId: requiredReference(
              accountIds,
              shortcut.accountId,
              "account shortcut",
            ),
          })),
        }
      : {}),
  };
};

const fromPortablePreferences = (
  value: PortablePreferences,
  accountIds: Map<string, number>,
): Preferences => {
  const { accountShortcuts, ...localValue } = value;
  return {
    ...localValue,
    ...(accountShortcuts
      ? {
          accountShortcuts: accountShortcuts.map((shortcut) => ({
            key: shortcut.key,
            ...(shortcut.ctrl === undefined ? {} : { ctrl: shortcut.ctrl }),
            accountId: accountIds.get(shortcut.accountPublicId) ?? 0,
          })),
        }
      : {}),
  };
};

const packageForChecksum = (data: PortableData) => ({
  ...data,
  manifest: { ...data.manifest, checksum: "" },
});

const checksum = async (data: PortableData) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify(packageForChecksum(data)),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const collections = [
  "accounts",
  "categories",
  "transactions",
  "accountReconciliations",
  "scheduledTransactions",
  "payees",
  "envelopes",
  "envelopeCategories",
  "budgetAllocations",
  "budgetTransfers",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateCollection = (data: PortableData, collection: string) => {
  const rows = data[collection as keyof PortableData];
  if (!Array.isArray(rows)) throw new Error(`Invalid ${collection} collection`);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.publicId !== "string") {
      throw new Error(`Invalid ${collection} public ID`);
    }
    if (ids.has(row.publicId)) {
      throw new Error(`Duplicate ${collection} public ID: ${row.publicId}`);
    }
    ids.add(row.publicId);
  }
};

export const validatePortableData = (value: unknown): PortableData => {
  if (!isRecord(value) || !isRecord(value.manifest)) {
    throw new Error("Invalid portable data package");
  }
  const data = value as unknown as PortableData;
  if (data.manifest.formatVersion !== PORTABLE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported portable data format: ${String(data.manifest.formatVersion)}`,
    );
  }
  if (typeof data.manifest.checksum !== "string") {
    throw new Error("Invalid portable data checksum");
  }
  if (!isRecord(data.preferences)) throw new Error("Invalid preferences");
  for (const collection of collections) validateCollection(data, collection);

  if (data.preferences.accountShortcuts !== undefined) {
    if (!Array.isArray(data.preferences.accountShortcuts)) {
      throw new Error("Invalid account shortcuts");
    }
    for (const shortcut of data.preferences.accountShortcuts) {
      if (
        !isRecord(shortcut) ||
        typeof shortcut.key !== "string" ||
        typeof shortcut.accountPublicId !== "string"
      ) {
        throw new Error("Invalid account shortcut");
      }
    }
  }

  const ids = Object.fromEntries(
    collections.map((collection) => [
      collection,
      new Set(
        (data[collection] as Array<{ publicId: string }>).map(
          (row) => row.publicId,
        ),
      ),
    ]),
  );
  const requireReference = (collection: keyof typeof ids, value: unknown) => {
    if (typeof value !== "string" || !ids[collection]?.has(value)) {
      throw new Error(`Invalid ${collection} relationship reference`);
    }
  };
  const optionalReference = (collection: keyof typeof ids, value: unknown) => {
    if (value !== null) requireReference(collection, value);
  };

  for (const row of data.categories)
    optionalReference("categories", row.parentPublicId);
  for (const row of data.transactions) {
    requireReference("accounts", row.accountPublicId);
    optionalReference("categories", row.categoryPublicId);
    optionalReference("transactions", row.transferTransactionPublicId);
  }
  for (const row of data.accountReconciliations) {
    requireReference("accounts", row.accountPublicId);
  }
  for (const row of data.scheduledTransactions) {
    requireReference("accounts", row.accountPublicId);
    optionalReference("categories", row.categoryPublicId);
    optionalReference("accounts", row.transferToAccountPublicId);
  }
  for (const row of data.payees)
    optionalReference("categories", row.categoryPublicId);
  for (const row of data.envelopeCategories) {
    requireReference("envelopes", row.envelopePublicId);
    requireReference("categories", row.categoryPublicId);
  }
  for (const row of data.budgetAllocations) {
    requireReference("envelopes", row.envelopePublicId);
  }
  for (const row of data.budgetTransfers) {
    requireReference("envelopes", row.fromEnvelopePublicId);
    requireReference("envelopes", row.toEnvelopePublicId);
  }
  for (const shortcut of data.preferences.accountShortcuts ?? []) {
    requireReference("accounts", shortcut.accountPublicId);
  }
  return data;
};

export const verifyPortableData = async (value: unknown) => {
  const data = validatePortableData(value);
  if ((await checksum(data)) !== data.manifest.checksum) {
    throw new Error("Portable data checksum mismatch");
  }
  return data;
};

export const serializePortableData = async (
  data: PortableData,
): Promise<string> => JSON.stringify(await verifyPortableData(data));

export const parsePortableData = async (
  document: string,
): Promise<PortableData> => {
  let value: unknown;
  try {
    value = JSON.parse(document);
  } catch {
    throw new Error("Invalid portable data JSON");
  }
  return verifyPortableData(value);
};

const tableIds = async (transaction: DatabaseTransaction, table: string) => {
  const rows = await transaction.query<{ id: number; public_id: string }>({
    sql: `SELECT id, public_id FROM ${table}`,
  });
  return new Map(rows.map((row) => [row.public_id, row.id]));
};

const tombstone = async (transaction: DatabaseTransaction, table: string) => {
  await transaction.execute({
    sql: `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP`,
  });
};

const upsert = (
  transaction: DatabaseTransaction,
  sql: string,
  params: Array<string | number | boolean | null>,
) =>
  transaction.execute({
    sql,
    params: params.map((value) =>
      typeof value === "boolean" ? Number(value) : value,
    ),
  });

export const importPortableData = async (
  database: DatabaseCapability,
  value: unknown,
) => {
  const data = await verifyPortableData(value);

  await database.transaction(async (transaction) => {
    const tables = [
      "accounts",
      "categories",
      "transactions",
      "account_reconciliations",
      "scheduled_transactions",
      "payees",
      "envelopes",
      "envelope_categories",
      "budget_allocations",
      "budget_transfers",
    ];
    for (const table of tables) await tombstone(transaction, table);
    await transaction.execute({
      sql: "UPDATE accounts SET deleted = 1",
    });
    await transaction.execute({
      sql: "UPDATE categories SET deleted = 1",
    });

    for (const row of data.accounts) {
      await upsert(
        transaction,
        `INSERT INTO accounts
          (public_id, created_at, updated_at, deleted_at, name, number, type,
           balance, currency, notes, interest_rate, credit_limit, deleted,
           pending_reconcile_balance, pending_reconcile_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, name = excluded.name,
            number = excluded.number, type = excluded.type,
            balance = excluded.balance, currency = excluded.currency,
            notes = excluded.notes, interest_rate = excluded.interest_rate,
            credit_limit = excluded.credit_limit, deleted = excluded.deleted,
            pending_reconcile_balance = excluded.pending_reconcile_balance,
            pending_reconcile_date = excluded.pending_reconcile_date`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          row.name,
          row.number,
          row.type,
          row.balance,
          row.currency,
          row.notes,
          row.interestRate,
          row.creditLimit,
          row.deleted,
          row.pendingReconcileBalance,
          row.pendingReconcileDate,
        ],
      );
    }
    const accountIds = await tableIds(transaction, "accounts");

    for (const row of data.categories) {
      await upsert(
        transaction,
        `INSERT INTO categories
          (public_id, created_at, updated_at, deleted_at, parent_id, name,
           expense_type, deleted)
          VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, parent_id = NULL,
            name = excluded.name, expense_type = excluded.expense_type,
            deleted = excluded.deleted`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          row.name,
          row.expenseType,
          row.deleted,
        ],
      );
    }
    const categoryIds = await tableIds(transaction, "categories");
    for (const row of data.categories) {
      await transaction.execute({
        sql: "UPDATE categories SET parent_id = ? WHERE public_id = ?",
        params: [
          row.parentPublicId === null
            ? null
            : (categoryIds.get(row.parentPublicId) ?? null),
          row.publicId,
        ],
      });
    }

    for (const row of data.envelopes) {
      await upsert(
        transaction,
        `INSERT INTO envelopes
          (public_id, created_at, updated_at, deleted_at, name, active, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, name = excluded.name,
            active = excluded.active, sort_order = excluded.sort_order`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          row.name,
          row.active,
          row.sortOrder,
        ],
      );
    }
    const envelopeIds = await tableIds(transaction, "envelopes");

    for (const row of data.transactions) {
      await upsert(
        transaction,
        `INSERT INTO transactions
          (public_id, created_at, updated_at, deleted_at, account_id, category_id,
           date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, account_id = excluded.account_id,
            category_id = excluded.category_id, date = excluded.date,
            payee = excluded.payee, amount = excluded.amount, notes = excluded.notes,
            cleared = excluded.cleared, reconciled = excluded.reconciled,
            transfer_transaction_id = NULL`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          accountIds.get(row.accountPublicId) ?? null,
          row.categoryPublicId === null
            ? null
            : (categoryIds.get(row.categoryPublicId) ?? null),
          row.date,
          row.payee,
          row.amount,
          row.notes,
          row.cleared,
          row.reconciled,
        ],
      );
    }
    const transactionIds = await tableIds(transaction, "transactions");
    for (const row of data.transactions) {
      await transaction.execute({
        sql: "UPDATE transactions SET transfer_transaction_id = ? WHERE public_id = ?",
        params: [
          row.transferTransactionPublicId === null
            ? null
            : (transactionIds.get(row.transferTransactionPublicId) ?? null),
          row.publicId,
        ],
      });
    }

    for (const row of data.accountReconciliations) {
      await upsert(
        transaction,
        `INSERT INTO account_reconciliations
          (public_id, created_at, updated_at, deleted_at, account_id, date, balance, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, account_id = excluded.account_id,
            date = excluded.date, balance = excluded.balance, notes = excluded.notes`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          accountIds.get(row.accountPublicId) ?? null,
          row.date,
          row.balance,
          row.notes,
        ],
      );
    }

    for (const row of data.scheduledTransactions) {
      await upsert(
        transaction,
        `INSERT INTO scheduled_transactions
          (public_id, created_at, updated_at, deleted_at, account_id, category_id,
           payee, amount, rrule, next_due_date, auto_post, days_in_advance, notes,
           active, transfer_to_account_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, account_id = excluded.account_id,
            category_id = excluded.category_id, payee = excluded.payee,
            amount = excluded.amount, rrule = excluded.rrule,
            next_due_date = excluded.next_due_date, auto_post = excluded.auto_post,
            days_in_advance = excluded.days_in_advance, notes = excluded.notes,
            active = excluded.active, transfer_to_account_id = excluded.transfer_to_account_id`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          accountIds.get(row.accountPublicId) ?? null,
          row.categoryPublicId === null
            ? null
            : (categoryIds.get(row.categoryPublicId) ?? null),
          row.payee,
          row.amount,
          row.rrule,
          row.nextDueDate,
          row.autoPost,
          row.daysInAdvance,
          row.notes,
          row.active,
          row.transferToAccountPublicId === null
            ? null
            : (accountIds.get(row.transferToAccountPublicId) ?? null),
        ],
      );
    }

    for (const row of data.payees) {
      await upsert(
        transaction,
        `INSERT INTO payees
          (public_id, created_at, updated_at, deleted_at, name, category_id, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, name = excluded.name,
            category_id = excluded.category_id, amount = excluded.amount`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          row.name,
          row.categoryPublicId === null
            ? null
            : (categoryIds.get(row.categoryPublicId) ?? null),
          row.amount,
        ],
      );
    }

    for (const row of data.envelopeCategories) {
      await upsert(
        transaction,
        `INSERT INTO envelope_categories
          (public_id, created_at, updated_at, deleted_at, envelope_id, category_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, envelope_id = excluded.envelope_id,
            category_id = excluded.category_id`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          envelopeIds.get(row.envelopePublicId) ?? null,
          categoryIds.get(row.categoryPublicId) ?? null,
        ],
      );
    }
    for (const row of data.budgetAllocations) {
      await upsert(
        transaction,
        `INSERT INTO budget_allocations
          (public_id, created_at, updated_at, deleted_at, envelope_id, month, assigned)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, envelope_id = excluded.envelope_id,
            month = excluded.month, assigned = excluded.assigned`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          envelopeIds.get(row.envelopePublicId) ?? null,
          row.month,
          row.assigned,
        ],
      );
    }
    for (const row of data.budgetTransfers) {
      await upsert(
        transaction,
        `INSERT INTO budget_transfers
          (public_id, created_at, updated_at, deleted_at, from_envelope_id,
           to_envelope_id, month, amount, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(public_id) DO UPDATE SET
            created_at = excluded.created_at, updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at, from_envelope_id = excluded.from_envelope_id,
            to_envelope_id = excluded.to_envelope_id, month = excluded.month,
            amount = excluded.amount, notes = excluded.notes`,
        [
          row.publicId,
          row.createdAt,
          row.updatedAt,
          row.deletedAt,
          envelopeIds.get(row.fromEnvelopePublicId) ?? null,
          envelopeIds.get(row.toEnvelopePublicId) ?? null,
          row.month,
          row.amount,
          row.notes,
        ],
      );
    }
    await transaction.execute({
      sql: `INSERT INTO settings (id, preferences) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences`,
      params: [
        JSON.stringify(
          fromPortablePreferences(
            data.preferences,
            new Map([...accountIds].map(([publicId, id]) => [publicId, id])),
          ),
        ),
      ],
    });
  });
};

export const createPortableData = async (
  database: DatabaseCapability,
  options: PortableExportOptions,
): Promise<PortableData> => {
  const data = await database.transaction(async (transaction) => {
    const read = async (table: string) =>
      transaction.query<Row>({ sql: `SELECT * FROM ${table} ORDER BY id ASC` });

    const [
      accounts,
      categories,
      transactions,
      accountReconciliations,
      scheduledTransactions,
      settings,
      payees,
      envelopes,
      envelopeCategories,
      budgetAllocations,
      budgetTransfers,
    ] = await Promise.all([
      read("accounts"),
      read("categories"),
      read("transactions"),
      read("account_reconciliations"),
      read("scheduled_transactions"),
      transaction.query<{ preferences: string }>({
        sql: "SELECT preferences FROM settings WHERE id = 1",
      }),
      read("payees"),
      read("envelopes"),
      read("envelope_categories"),
      read("budget_allocations"),
      read("budget_transfers"),
    ]);

    const accountIds = publicIds(accounts);
    const categoryIds = publicIds(categories);
    const transactionIds = publicIds(transactions);
    const envelopeIds = publicIds(envelopes);

    const result: PortableData = {
      manifest: {
        formatVersion: PORTABLE_FORMAT_VERSION,
        applicationVersion: options.applicationVersion,
        exportedAt: options.exportedAt ?? new Date().toISOString(),
        minimumReaderVersion: options.minimumReaderVersion,
        checksum: "",
      },
      preferences: toPortablePreferences(
        settings[0]?.preferences ? JSON.parse(settings[0].preferences) : {},
        accountIds,
      ),
      accounts: accounts.map((row) => ({
        ...syncFields(row),
        name: asString(row.name, "account name"),
        number: asNullableString(row.number),
        type: asString(row.type, "account type"),
        balance: asNumber(row.balance, "account balance"),
        currency: asString(row.currency, "account currency"),
        notes: asNullableString(row.notes),
        interestRate: asNullableNumber(row.interest_rate),
        creditLimit: asNullableNumber(row.credit_limit),
        deleted: asBoolean(row.deleted, "account deleted"),
        pendingReconcileBalance: asNullableNumber(
          row.pending_reconcile_balance,
        ),
        pendingReconcileDate: asNullableString(row.pending_reconcile_date),
      })),
      categories: categories.map((row) => ({
        ...syncFields(row),
        parentPublicId: reference(categoryIds, row.parent_id),
        name: asString(row.name, "category name"),
        expenseType: asString(row.expense_type, "category expense type"),
        deleted: asBoolean(row.deleted, "category deleted"),
      })),
      transactions: transactions.map((row) => ({
        ...syncFields(row),
        accountPublicId: requiredReference(
          accountIds,
          row.account_id,
          "account",
        ),
        categoryPublicId: reference(categoryIds, row.category_id),
        date: asString(row.date, "transaction date"),
        payee: asString(row.payee, "transaction payee"),
        amount: asNumber(row.amount, "transaction amount"),
        notes: asNullableString(row.notes),
        cleared: asBoolean(row.cleared, "transaction cleared"),
        reconciled: asBoolean(row.reconciled, "transaction reconciled"),
        transferTransactionPublicId: reference(
          transactionIds,
          row.transfer_transaction_id,
        ),
      })),
      accountReconciliations: accountReconciliations.map((row) => ({
        ...syncFields(row),
        accountPublicId: requiredReference(
          accountIds,
          row.account_id,
          "account",
        ),
        date: asString(row.date, "reconciliation date"),
        balance: asNumber(row.balance, "reconciliation balance"),
        notes: asNullableString(row.notes),
      })),
      scheduledTransactions: scheduledTransactions.map((row) => ({
        ...syncFields(row),
        accountPublicId: requiredReference(
          accountIds,
          row.account_id,
          "account",
        ),
        categoryPublicId: reference(categoryIds, row.category_id),
        payee: asString(row.payee, "scheduled payee"),
        amount: asNumber(row.amount, "scheduled amount"),
        rrule: asString(row.rrule, "scheduled recurrence"),
        nextDueDate: asNullableString(row.next_due_date),
        autoPost: asBoolean(row.auto_post, "scheduled auto-post"),
        daysInAdvance: asNullableNumber(row.days_in_advance),
        notes: asNullableString(row.notes),
        active: asBoolean(row.active, "scheduled active"),
        transferToAccountPublicId: reference(
          accountIds,
          row.transfer_to_account_id,
        ),
      })),
      payees: payees.map((row) => ({
        ...syncFields(row),
        name: asString(row.name, "payee name"),
        categoryPublicId: reference(categoryIds, row.category_id),
        amount: asNullableNumber(row.amount),
      })),
      envelopes: envelopes.map((row) => ({
        ...syncFields(row),
        name: asString(row.name, "envelope name"),
        active: asBoolean(row.active, "envelope active"),
        sortOrder: asNumber(row.sort_order, "envelope sort order"),
      })),
      envelopeCategories: envelopeCategories.map((row) => ({
        ...syncFields(row),
        envelopePublicId: requiredReference(
          envelopeIds,
          row.envelope_id,
          "envelope",
        ),
        categoryPublicId: requiredReference(
          categoryIds,
          row.category_id,
          "category",
        ),
      })),
      budgetAllocations: budgetAllocations.map((row) => ({
        ...syncFields(row),
        envelopePublicId: requiredReference(
          envelopeIds,
          row.envelope_id,
          "envelope",
        ),
        month: asString(row.month, "allocation month"),
        assigned: asNumber(row.assigned, "allocation amount"),
      })),
      budgetTransfers: budgetTransfers.map((row) => ({
        ...syncFields(row),
        fromEnvelopePublicId: requiredReference(
          envelopeIds,
          row.from_envelope_id,
          "source envelope",
        ),
        toEnvelopePublicId: requiredReference(
          envelopeIds,
          row.to_envelope_id,
          "target envelope",
        ),
        month: asString(row.month, "transfer month"),
        amount: asNumber(row.amount, "transfer amount"),
        notes: asNullableString(row.notes),
      })),
    };

    return result;
  });

  data.manifest.checksum = await checksum(data);
  return data;
};
