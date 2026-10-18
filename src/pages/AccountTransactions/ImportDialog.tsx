import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  useResponsiveOverlay,
} from "@/components/responsive-overlay";
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
import { useAccounts } from "@/hooks/useAccounts";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTransactions } from "@/hooks/useTransactions";
import { type MatchResult, matchQifTransactions } from "@/lib/qif-matcher";
import { parseQif } from "@/lib/qif-parser";
import { cn, formatDate } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  qifContent: string;
  filename: string;
};

function sameSet(a: Set<number>, b: Set<number>) {
  return a.size === b.size && [...a].every((value) => b.has(value));
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
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const analysis = useMemo(() => {
    try {
      const { accountType: qifType, transactions: qifTxs } =
        parseQif(qifContent);
      const appType = account?.type ?? "bank";
      const qifExpectsType = qifType === "credit_card" ? "credit_card" : "bank";
      if (qifExpectsType !== appType) {
        const label = qifType === "credit_card" ? "Credit Card" : "Bank";
        return {
          results: [] as MatchResult[],
          parseError: `QIF file is type ${label} but this is a ${appType === "credit_card" ? "Credit Card" : "Bank"} account`,
        };
      }
      return {
        results: matchQifTransactions(
          qifTxs,
          transactions,
          account?.lastReconcileDate ?? null,
        ),
        parseError: null,
      };
    } catch {
      return { results: [] as MatchResult[], parseError: null };
    }
  }, [qifContent, transactions, account?.lastReconcileDate, account?.type]);
  const { results, parseError } = analysis;

  const defaultChecked = useMemo(() => {
    const initial = new Set<number>();
    results.forEach((r, i) => {
      if (r.checked) initial.add(i);
    });
    return initial;
  }, [results]);

  const [checkedIndexes, setCheckedIndexes] = useState<Set<number>>(
    () => defaultChecked,
  );
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const importingRef = useRef(false);

  // Matching changes (new file, refetched transactions) restart from the
  // suggested selection.
  useEffect(() => {
    setCheckedIndexes(defaultChecked);
  }, [defaultChecked]);

  const dirty = !sameSet(checkedIndexes, defaultChecked);
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
      new Set(
        results
          .map((r, i) => (r.status === "new" ? i : -1))
          .filter((i) => i >= 0),
      ),
    );
  }

  function deselectAll() {
    setCheckedIndexes(new Set());
  }

  function requestClose() {
    if (importingRef.current) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  // Implicit dismissal (swipe, Escape, backdrop, close icon) never silently
  // discards an edited selection and is ignored while importing.
  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  async function handleImport() {
    // Guards Enter + click (or a double tap) before `importing` re-renders.
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setImportError(null);
    const selected = [...checkedIndexes];
    let imported = 0;
    try {
      for (const idx of selected) {
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
        imported += 1;
      }
      onOpenChange(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Import failed";
      setImportError(
        imported > 0
          ? `Import stopped after ${imported} of ${selected.length}: ${reason}`
          : reason,
      );
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size="expanded"
        dialogClassName="sm:max-w-3xl"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle
            ref={titleRef}
            tabIndex={-1}
            className="break-all"
          >
            Import — {filename}
          </ResponsiveOverlayTitle>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody className="flex flex-col gap-4">
          {parseError && (
            <p role="alert" className="text-sm text-destructive">
              {parseError}
            </p>
          )}

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {results.length} transactions: {newCount} new, {dupCount}{" "}
              duplicates
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

          <ImportResults
            results={results}
            checkedIndexes={checkedIndexes}
            onToggle={toggleChecked}
          />

          {importError && (
            <p role="alert" className="text-sm text-destructive">
              {importError}
            </p>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter className="sm:justify-between">
          <Button variant="outline" onClick={requestClose} disabled={importing}>
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
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard import?"
          description="Your transaction selection hasn't been imported."
          confirmLabel="Discard"
          onConfirm={() => onOpenChange(false)}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

type ImportResultsProps = {
  results: MatchResult[];
  checkedIndexes: Set<number>;
  onToggle: (index: number) => void;
};

/** Cards on phones (no horizontal scroll), the review table from `md`. */
function ImportResults({
  results,
  checkedIndexes,
  onToggle,
}: ImportResultsProps) {
  const { compact } = useResponsiveOverlay();

  if (results.length === 0) {
    return (
      <p className="rounded-md border border-border py-12 text-center text-sm text-muted-foreground">
        No transactions found in file.
      </p>
    );
  }

  if (compact) {
    return (
      <ul className="flex flex-col gap-2" aria-label="Transactions to import">
        {results.map((r, i) => (
          <li key={i}>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3",
                checkedIndexes.has(i) && "bg-accent/50",
                r.status === "out-of-range" && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={checkedIndexes.has(i)}
                onChange={() => onToggle(i)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-blue-500"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {r.qifTx.payee}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <Amount value={r.qifTx.amount} />
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(r.qifTx.date)}</span>
                  {statusBadge(r)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 bg-accent text-center" />
            <TableHead className="w-24 bg-accent">Status</TableHead>
            <TableHead className="bg-accent">Date</TableHead>
            <TableHead className="bg-accent">Payee</TableHead>
            <TableHead className="bg-accent text-right">Withdrawal</TableHead>
            <TableHead className="bg-accent text-right">Deposit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, i) => (
            <TableRow
              key={i}
              className={`cursor-pointer ${r.status === "out-of-range" ? "opacity-50" : ""}`}
              onClick={() => onToggle(i)}
            >
              <TableCell className="text-center">
                <input
                  type="checkbox"
                  checked={checkedIndexes.has(i)}
                  onChange={() => onToggle(i)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Import ${r.qifTx.payee}`}
                  className="size-4 cursor-pointer accent-blue-500"
                />
              </TableCell>
              <TableCell>{statusBadge(r)}</TableCell>
              <TableCell>{formatDate(r.qifTx.date)}</TableCell>
              <TableCell className="max-w-48 truncate">
                {r.qifTx.payee}
              </TableCell>
              <TableCell className="text-right">
                {r.qifTx.amount < 0 ? <Amount value={r.qifTx.amount} /> : null}
              </TableCell>
              <TableCell className="text-right">
                {r.qifTx.amount > 0 ? <Amount value={r.qifTx.amount} /> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
