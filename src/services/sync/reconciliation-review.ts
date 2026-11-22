// SPEC.md 8.11: after a sync, accounts whose reconciliation no longer adds up
// are reported for review. Nothing is repaired and nothing is stored: the list
// is computed from the current data on every cycle, so a flag clears by itself
// when the totals agree again.
//
// The app has no service function for the reconciled total. Its arithmetic
// lives in the reconcile page (src/pages/Reconcile/ReconcilePage.tsx): the
// opening balance is the latest checkpoint's balance (or the account's
// opening balance), each reconciled transaction adds its amount, and the
// statement balance matches when the difference is under half a penny
// (`Math.abs(difference) < 0.005`). A finished reconciliation therefore
// satisfies `account.balance + SUM(reconciled amounts) = latest checkpoint
// balance`, which is what is checked here, with the same tolerance.

import type { DatabaseCapability } from "@/platform/database";

/** The reconcile page's tolerance: a difference under half a penny agrees. */
const PENNY_TOLERANCE = 0.005;

type ReviewRow = {
  public_id: string;
  balance: number;
  reconciled_sum: number;
  checkpoint_balance: number;
};

/**
 * Public ids of the live accounts that have a reconciliation checkpoint and
 * whose reconciled total (opening balance plus live reconciled transactions)
 * differs from the latest checkpoint's balance. Ordered by public id.
 */
export const findReconciliationsNeedingReview = async (
  database: DatabaseCapability,
): Promise<string[]> => {
  const rows = await database.query<ReviewRow>({
    sql: `SELECT a.public_id, a.balance,
        COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.id AND t.reconciled = 1
            AND t.deleted_at IS NULL), 0) AS reconciled_sum,
        (SELECT r.balance FROM account_reconciliations r
          WHERE r.account_id = a.id AND r.deleted_at IS NULL
          ORDER BY r.date DESC, r.id DESC LIMIT 1) AS checkpoint_balance
      FROM accounts a
      WHERE a.deleted = 0 AND a.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM account_reconciliations r
          WHERE r.account_id = a.id AND r.deleted_at IS NULL)
      ORDER BY a.public_id`,
  });
  return rows
    .filter(
      (row) =>
        Math.abs(
          row.checkpoint_balance - (row.balance + row.reconciled_sum),
        ) >= PENNY_TOLERANCE,
    )
    .map((row) => row.public_id);
};
