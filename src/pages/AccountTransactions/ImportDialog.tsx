import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { type MatchResult, matchQifTransactions } from "@/lib/qif-matcher";
import { parseQif } from "@/lib/qif-parser";
import { formatDate } from "@/lib/utils";
import { useMemo, useState } from "react";

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  qifContent: string;
  filename: string;
};

export function ImportDialog({
  open,
  onOpenChange,
  accountId,
  qifContent,
  filename,
}: ImportDialogProps) {
  const { transactions, create } = useTransactions(accountId);
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);

  const [checkedIndexes, setCheckedIndexes] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const results = useMemo(() => {
    try {
      const { accountType: qifType, transactions: qifTxs } =
        parseQif(qifContent);
      const appType = account?.type ?? "bank";
      const qifExpectsType = qifType === "credit_card" ? "credit_card" : "bank";
      if (qifExpectsType !== appType) {
        const label = qifType === "credit_card" ? "Credit Card" : "Bank";
        setParseError(
          `QIF file is type ${label} but this is a ${appType === "credit_card" ? "Credit Card" : "Bank"} account`,
        );
        return [];
      }
      setParseError(null);
      const matched = matchQifTransactions(
        qifTxs,
        transactions,
        account?.lastReconcileDate ?? null,
      );
      // Initialize checked state from match results
      const initialChecked = new Set<number>();
      matched.forEach((r, i) => {
        if (r.checked) initialChecked.add(i);
      });
      setCheckedIndexes(initialChecked);
      return matched;
    } catch {
      return [];
    }
  }, [qifContent, transactions, account?.lastReconcileDate, account?.type]);

  const checkedCount = checkedIndexes.size;
  const newCount = results.filter((r) => r.status === "new").length;
  const dupCount = results.filter((r) => r.status === "duplicate").length;
  const oorCount = results.filter((r) => r.status === "out-of-range").length;

  function toggleChecked(index: number) {
    setCheckedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAllNew() {
    setCheckedIndexes(
      new Set(results.map((r, i) => (r.status === "new" ? i : -1)).filter((i) => i >= 0)),
    );
  }

  function deselectAll() {
    setCheckedIndexes(new Set());
  }

  async function handleImport() {
    setImporting(true);
    try {
      for (const idx of checkedIndexes) {
        const r = results[idx];
        if (!r) continue;
        await create.mutateAsync({
          accountId,
          date: r.qifTx.date,
          payee: r.qifTx.payee,
          amount: r.qifTx.amount,
          categoryId: null,
          notes: r.qifTx.memo,
          cleared: true,
        });
      }
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  }

  function statusBadge(r: MatchResult) {
    switch (r.status) {
      case "new":
        return <Badge className="bg-green-600 text-white">New</Badge>;
      case "duplicate":
        return <Badge variant="secondary">Duplicate</Badge>;
      case "out-of-range":
        return (
          <Badge variant="secondary" className="opacity-60">
            Out of range
          </Badge>
        );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import — {filename}</DialogTitle>
        </DialogHeader>

        {parseError && (
          <p className="text-sm text-destructive">{parseError}</p>
        )}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {results.length} transactions: {newCount} new, {dupCount} duplicates
            {oorCount > 0 && `, ${oorCount} out of range`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAllNew}>
              Select new
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Deselect all
            </Button>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-center bg-accent w-10" />
                <TableHead className="bg-accent w-24">Status</TableHead>
                <TableHead className="bg-accent">Date</TableHead>
                <TableHead className="bg-accent">Payee</TableHead>
                <TableHead className="text-right bg-accent">
                  Withdrawal
                </TableHead>
                <TableHead className="text-right bg-accent">
                  Deposit
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No transactions found in file.
                  </TableCell>
                </TableRow>
              ) : (
                results.map((r, i) => (
                  <TableRow
                    key={i}
                    className={`cursor-pointer ${r.status === "out-of-range" ? "opacity-50" : ""}`}
                    onClick={() => toggleChecked(i)}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={checkedIndexes.has(i)}
                        onChange={() => toggleChecked(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer accent-blue-500 size-4"
                      />
                    </TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    <TableCell>{formatDate(r.qifTx.date)}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {r.qifTx.payee}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.qifTx.amount < 0 ? (
                        <Amount value={r.qifTx.amount} />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.qifTx.amount > 0 ? (
                        <Amount value={r.qifTx.amount} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={checkedCount === 0 || importing}
          >
            {importing
              ? "Importing..."
              : `Import ${checkedCount} transaction${checkedCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
