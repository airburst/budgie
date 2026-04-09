import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeRunningBalances } from "@/lib/balances";
import { cn, formatDate } from "@/lib/utils";
import type { Category, Transaction } from "@/types/electron";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

type TransactionsTableProps = {
  transactions: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  openingBalance: number;
  onEdit: (id: number, options?: { focusAmount?: boolean }) => void;
  onDelete: (id: number) => void;
  onToggleCleared: (id: number, cleared: boolean) => void;
};

export function TransactionsTable({
  transactions,
  allTransactions,
  categories,
  openingBalance,
  onEdit,
  onDelete,
  onToggleCleared,
}: TransactionsTableProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const runningBalances = useMemo(
    () => computeRunningBalances(allTransactions, openingBalance),
    [allTransactions, openingBalance],
  );

  const today = new Date().toISOString().slice(0, 10);
  const futureBoundaryIndex = transactions.findIndex((tx) => tx.date > today);

  const headers = (
    <TableRow className="hover:bg-transparent">
      <TableHead className="bg-accent">Date</TableHead>
      <TableHead className="bg-accent">Payee</TableHead>
      <TableHead className="text-right bg-accent">In</TableHead>
      <TableHead className="text-right bg-accent">Out</TableHead>
      <TableHead className="bg-accent">Category</TableHead>
      <TableHead className="bg-accent">Notes</TableHead>
      <TableHead className="text-right bg-accent">Balance</TableHead>
      <TableHead className="text-center bg-accent">C/R</TableHead>
      <TableHead className="bg-accent" />
    </TableRow>
  );

  if (transactions.length === 0) {
    return (
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>{headers}</TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={9}
                className="text-center text-muted-foreground py-12"
              >
                No transactions yet.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <>
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>{headers}</TableHeader>
          <TableBody>
            {transactions.map((tx, i) => {
              const category = tx.categoryId
                ? categoryMap.get(tx.categoryId)
                : null;
              const balance = runningBalances.get(tx.id) ?? openingBalance;
              const isReconciled = tx.reconciled;
              const isLastPast =
                futureBoundaryIndex > 0 && i === futureBoundaryIndex - 1;

              return (
                <TableRow
                  key={tx.id}
                  className={cn(
                    isReconciled ? "opacity-60" : "cursor-pointer",
                    isLastPast && "border-b-4 border-b-sidebar-primary",
                  )}
                  onDoubleClick={() => {
                    if (!isReconciled) onEdit(tx.id, { focusAmount: true });
                  }}
                >
                  <TableCell>{formatDate(tx.date)}</TableCell>
                  <TableCell>{tx.payee}</TableCell>
                  <TableCell className="text-right">
                    {tx.amount > 0 ? <Amount value={tx.amount} /> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.amount < 0 ? <Amount value={tx.amount} /> : null}
                  </TableCell>
                  <TableCell>
                    {category ? (
                      <Badge variant="secondary">{category.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                    {tx.notes ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {isReconciled || tx.cleared ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <Amount value={balance} />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isReconciled ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        R
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!tx.cleared}
                        onChange={(e) =>
                          onToggleCleared(tx.id, e.target.checked)
                        }
                        disabled={tx.date > today}
                        className={
                          tx.date > today
                            ? "cursor-not-allowed opacity-30 align-middle"
                            : "cursor-pointer align-middle"
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isReconciled ? null : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(tx.id)}
                          aria-label="Edit transaction"
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPendingDeleteId(tx.id)}
                          aria-label="Delete transaction"
                        >
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete transaction?"
        description="This will permanently delete this transaction. This action cannot be undone."
        onConfirm={() => onDelete(pendingDeleteId!)}
      />
    </>
  );
}
