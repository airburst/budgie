import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { Account, ScheduledTransaction } from "@/types/electron";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { FrequencyBadge } from "./FrequencyBadge";

type ScheduledTableProps = {
  scheduledTransactions: ScheduledTransaction[];
  accounts: Account[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function ScheduledTable({
  scheduledTransactions,
  accounts,
  onEdit,
  onDelete,
}: ScheduledTableProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  if (scheduledTransactions.length === 0) {
    return (
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-accent">Next Due</TableHead>
              <TableHead className="bg-accent">Payee</TableHead>
              <TableHead className="text-right bg-accent">Amount</TableHead>
              <TableHead className="bg-accent">Frequency</TableHead>
              <TableHead className="bg-accent">Account</TableHead>
              <TableHead className="bg-accent" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground py-12"
              >
                No reminders yet.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  const sorted = [...scheduledTransactions].sort((a, b) => {
    if (!a.nextDueDate) return 1;
    if (!b.nextDueDate) return -1;
    return a.nextDueDate.localeCompare(b.nextDueDate);
  });

  return (
    <>
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-accent">Next Due</TableHead>
              <TableHead className="bg-accent">Payee</TableHead>
              <TableHead className="text-right bg-accent">Amount</TableHead>
              <TableHead className="bg-accent">Frequency</TableHead>
              <TableHead className="bg-accent">Account</TableHead>
              <TableHead className="bg-accent" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => {
              const account = accountMap.get(s.accountId);
              return (
                <TableRow key={s.id} className={!s.active ? "opacity-50" : ""}>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.nextDueDate ? formatDate(s.nextDueDate) : "—"}
                  </TableCell>
                  <TableCell className="font-medium">{s.payee}</TableCell>
                  <TableCell className="text-right">
                    <Amount value={s.amount} />
                  </TableCell>
                  <TableCell>
                    <FrequencyBadge rruleStr={s.rrule} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(s.id)}
                        aria-label="Edit scheduled payment"
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPendingDeleteId(s.id)}
                        aria-label="Delete scheduled payment"
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </div>
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
        title="Delete reminder?"
        description="This will permanently delete this reminder. This action cannot be undone."
        onConfirm={() => onDelete(pendingDeleteId!)}
      />
    </>
  );
}
