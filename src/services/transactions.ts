import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { SyncMetadataFields, Transaction } from "@/types/electron";

export type TransactionCreate = Omit<
  Transaction,
  | "id"
  | "createdAt"
  | "reconciled"
  | "transferTransactionId"
  | SyncMetadataFields
>;
export type TransactionUpdate = Partial<
  Omit<
    Transaction,
    "id" | "createdAt" | "transferTransactionId" | SyncMetadataFields
  >
>;

type TransactionRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  account_id: number;
  category_id: number | null;
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  cleared: number;
  reconciled: number;
  transfer_transaction_id: number | null;
  created_at: string | null;
};

type TransferCategory = {
  id: number;
  name: string;
  parent_id: number | null;
  expense_type: string;
};

const columnsForTransaction: Partial<Record<keyof TransactionUpdate, string>> =
  {
    accountId: "account_id",
    categoryId: "category_id",
    date: "date",
    payee: "payee",
    amount: "amount",
    notes: "notes",
    cleared: "cleared",
    reconciled: "reconciled",
  };

const mapTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  accountId: row.account_id,
  categoryId: row.category_id,
  date: row.date,
  payee: row.payee,
  amount: row.amount,
  notes: row.notes,
  cleared: Boolean(row.cleared),
  reconciled: Boolean(row.reconciled),
  transferTransactionId: row.transfer_transaction_id,
  createdAt: row.created_at,
});

export const createTransaction = async (
  database: DatabaseCapability,
  data: TransactionCreate,
): Promise<Transaction[]> => {
  const category = data.categoryId
    ? (
        await database.query<TransferCategory>({
          sql: "SELECT id, name, parent_id, expense_type FROM categories WHERE id = ?",
          params: [data.categoryId],
        })
      )[0]
    : undefined;

  if (
    !category ||
    category.expense_type !== "transfer" ||
    category.parent_id === null
  ) {
    const rows = await database.query<TransactionRow>({
      sql: `INSERT INTO transactions
        (account_id, category_id, date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL) RETURNING *`,
      params: [
        data.accountId,
        data.categoryId,
        data.date,
        data.payee,
        data.amount,
        data.notes,
        data.cleared ? 1 : 0,
      ],
    });
    return rows.map(mapTransaction);
  }

  const [targetAccount, sourceAccount] = await Promise.all([
    database.query<{ id: number }>({
      sql: "SELECT id FROM accounts WHERE name = ? AND deleted = 0",
      params: [category.name],
    }),
    database.query<{ id: number; name: string }>({
      sql: "SELECT id, name FROM accounts WHERE id = ? AND deleted = 0",
      params: [data.accountId],
    }),
  ]);
  if (!targetAccount[0] || !sourceAccount[0]) {
    const rows = await database.query<TransactionRow>({
      sql: `INSERT INTO transactions
        (account_id, category_id, date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL) RETURNING *`,
      params: [
        data.accountId,
        data.categoryId,
        data.date,
        data.payee,
        data.amount,
        data.notes,
        data.cleared ? 1 : 0,
      ],
    });
    return rows.map(mapTransaction);
  }
  const target = targetAccount[0];

  const counterCategory = await database.query<{ id: number }>({
    sql: "SELECT id FROM categories WHERE parent_id = ? AND name = ? LIMIT 1",
    params: [category.parent_id, sourceAccount[0].name],
  });

  return database.transaction(async (transaction) => {
    const primaryRows = await transaction.query<TransactionRow>({
      sql: `INSERT INTO transactions
        (account_id, category_id, date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL) RETURNING *`,
      params: [
        data.accountId,
        data.categoryId,
        data.date,
        data.payee,
        data.amount,
        data.notes,
        data.cleared ? 1 : 0,
      ],
    });
    const primary = primaryRows[0];
    if (!primary)
      throw new Error("Transfer primary transaction was not created");

    const counterRows = await transaction.query<TransactionRow>({
      sql: `INSERT INTO transactions
        (account_id, category_id, date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING *`,
      params: [
        target.id,
        counterCategory[0]?.id ?? null,
        data.date,
        data.payee,
        -data.amount,
        data.notes,
        data.cleared ? 1 : 0,
        primary.id,
      ],
    });
    const counter = counterRows[0];
    if (!counter)
      throw new Error("Transfer counter transaction was not created");

    await transaction.execute({
      sql: "UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?",
      params: [counter.id, primary.id],
    });
    return [{ ...mapTransaction(primary), transferTransactionId: counter.id }];
  });
};

export const createTransactionService = (database: DatabaseCapability) => ({
  getAll: async () => {
    const rows = await database.query<TransactionRow>({
      sql: "SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY date ASC, created_at ASC, id ASC",
    });
    return rows.map(mapTransaction);
  },
  getById: async (id: number) => {
    const rows = await database.query<TransactionRow>({
      sql: "SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL",
      params: [id],
    });
    return rows[0] ? mapTransaction(rows[0]) : null;
  },
  getByAccount: async (accountId: number) => {
    const rows = await database.query<TransactionRow>({
      sql: "SELECT * FROM transactions WHERE account_id = ? AND deleted_at IS NULL ORDER BY date ASC, created_at ASC, id ASC",
      params: [accountId],
    });
    return rows.map(mapTransaction);
  },
  getByDateRange: async (
    startDate: string,
    endDate: string,
    accountIds?: number[],
  ) => {
    const accountClause = accountIds?.length
      ? ` AND account_id IN (${accountIds.map(() => "?").join(", ")})`
      : "";
    const rows = await database.query<TransactionRow>({
      sql: `SELECT * FROM transactions WHERE deleted_at IS NULL AND date >= ? AND date <= ?${accountClause} ORDER BY date ASC`,
      params: [startDate, endDate, ...(accountIds ?? [])],
    });
    return rows.map(mapTransaction);
  },
  create: (data: TransactionCreate) => createTransaction(database, data),
  update: async (id: number, data: TransactionUpdate) =>
    database.transaction(async (transaction) => {
      const existingRows = await transaction.query<
        TransactionRow & {
          reconciled: number;
        }
      >({
        sql: "SELECT * FROM transactions WHERE id = ?",
        params: [id],
      });
      const existing = existingRows[0];
      if (!existing) return [];
      if (existing.reconciled) {
        throw new Error(
          `Transaction ${id} is reconciled and cannot be modified.`,
        );
      }
      const newCategory = data.categoryId
        ? (
            await transaction.query<TransferCategory>({
              sql: "SELECT id, name, parent_id, expense_type FROM categories WHERE id = ?",
              params: [data.categoryId],
            })
          )[0]
        : undefined;
      const isTransfer = (category?: TransferCategory | null) =>
        category?.expense_type === "transfer" && category.parent_id !== null;
      const wasTransfer = existing.transfer_transaction_id !== null;
      const becomesTransfer =
        data.categoryId !== undefined && isTransfer(newCategory);

      const clearCounter = async (counterId: number) => {
        await transaction.execute({
          sql: "UPDATE transactions SET transfer_transaction_id = NULL WHERE id IN (?, ?)",
          params: [id, counterId],
        });
        await transaction.execute({
          sql: "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [counterId],
        });
      };

      const createCounter = async (
        primary: TransactionRow,
        category: TransferCategory,
      ) => {
        const target = await transaction.query<{ id: number }>({
          sql: "SELECT id FROM accounts WHERE name = ? AND deleted = 0",
          params: [category.name],
        });
        const source = await transaction.query<{ name: string }>({
          sql: "SELECT name FROM accounts WHERE id = ? AND deleted = 0",
          params: [primary.account_id],
        });
        if (!target[0] || !source[0]) return null;
        const counterCategory = await transaction.query<{ id: number }>({
          sql: "SELECT id FROM categories WHERE parent_id = ? AND name = ? LIMIT 1",
          params: [category.parent_id, source[0].name],
        });
        const rows = await transaction.query<TransactionRow>({
          sql: `INSERT INTO transactions
            (account_id, category_id, date, payee, amount, notes, cleared, reconciled, transfer_transaction_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING *`,
          params: [
            target[0].id,
            counterCategory[0]?.id ?? null,
            primary.date,
            primary.payee,
            -primary.amount,
            primary.notes,
            primary.cleared,
            primary.id,
          ],
        });
        const counter = rows[0];
        if (!counter)
          throw new Error("Transfer counter transaction was not created");
        await transaction.execute({
          sql: "UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?",
          params: [counter.id, primary.id],
        });
        return counter;
      };

      if (data.categoryId !== undefined && (wasTransfer || becomesTransfer)) {
        if (wasTransfer && existing.transfer_transaction_id !== null) {
          await clearCounter(existing.transfer_transaction_id);
        }
        const fields = Object.entries(data).filter(
          ([key, value]) =>
            value !== undefined &&
            columnsForTransaction[key as keyof TransactionUpdate],
        ) as Array<[keyof TransactionUpdate, string | number | boolean | null]>;
        const values = fields.map(([, value]) =>
          typeof value === "boolean" ? (value ? 1 : 0) : value,
        );
        const updatedRows = await transaction.query<TransactionRow>({
          sql: `UPDATE transactions SET ${fields.map(([key]) => `${columnsForTransaction[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
          params: [...values, id],
        });
        const updated = updatedRows[0];
        if (!updated) return [];
        if (becomesTransfer && newCategory) {
          const counter = await createCounter(updated, newCategory);
          if (counter) {
            return [
              { ...mapTransaction(updated), transferTransactionId: counter.id },
            ];
          }
        }
        return updatedRows.map(mapTransaction);
      }
      const fields = Object.entries(data).filter(
        ([key, value]) =>
          value !== undefined &&
          columnsForTransaction[key as keyof TransactionUpdate],
      ) as Array<[keyof TransactionUpdate, string | number | boolean | null]>;
      if (fields.length === 0) return [];
      const values = fields.map(([, value]) =>
        typeof value === "boolean" ? (value ? 1 : 0) : value,
      );
      const updated = await transaction.query<TransactionRow>({
        sql: `UPDATE transactions SET ${fields.map(([key]) => `${columnsForTransaction[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [...values, id],
      });
      const counterId = existing.transfer_transaction_id;
      if (counterId !== null) {
        const propagate: Array<[string, string | number | null]> = [];
        if (data.amount !== undefined) propagate.push(["amount", -data.amount]);
        if (data.date !== undefined) propagate.push(["date", data.date]);
        if (data.payee !== undefined) propagate.push(["payee", data.payee]);
        if (data.notes !== undefined) propagate.push(["notes", data.notes]);
        const counter = await transaction.query<{ reconciled: number }>({
          sql: "SELECT reconciled FROM transactions WHERE id = ?",
          params: [counterId],
        });
        if (counter[0] && !counter[0].reconciled && propagate.length > 0) {
          await transaction.execute({
            sql: `UPDATE transactions SET ${propagate.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`,
            params: [...propagate.map(([, value]) => value), counterId],
          });
        }
      }
      return updated.map(mapTransaction);
    }),
  delete: async (id: number) =>
    database.transaction(async (transaction) => {
      const existing = await transaction.query<{
        reconciled: number;
        transfer_transaction_id: number | null;
      }>({
        sql: "SELECT reconciled, transfer_transaction_id FROM transactions WHERE id = ?",
        params: [id],
      });
      if (!existing[0]) return;
      if (existing[0].reconciled) {
        throw new Error(
          `Transaction ${id} is reconciled and cannot be deleted.`,
        );
      }
      const counterId = existing[0].transfer_transaction_id;
      if (counterId !== null) {
        await transaction.execute({
          sql: "UPDATE transactions SET transfer_transaction_id = NULL WHERE id IN (?, ?)",
          params: [id, counterId],
        });
        await transaction.execute({
          sql: "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (?, ?)",
          params: [id, counterId],
        });
      } else {
        await transaction.execute({
          sql: "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [id],
        });
      }
    }),
});
