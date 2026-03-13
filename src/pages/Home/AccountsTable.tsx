import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { AccountWithBalances } from "@/types/electron";
import { CheckCircle2Icon, EditIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ReconciliationDialog } from "../AccountTransactions/ReconciliationDialog";
import { AccountForm } from "./AccountForm";

type AccountsTableProps = {
  accounts: AccountWithBalances[];
};

export function AccountsTable({ accounts }: AccountsTableProps) {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reconcileAccount, setReconcileAccount] =
    useState<AccountWithBalances | null>(null);

  const editingAccount =
    editingId != null ? accounts.find((a) => a.id === editingId) : null;

  if (accounts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-muted-foreground">
            No accounts yet. Add your first account to get started.
          </p>
          <Button onClick={() => setFormOpen(true)}>
            <PlusIcon />
            Add Account
          </Button>
        </div>
        <AccountForm open={formOpen} onOpenChange={setFormOpen} />
      </>
    );
  }

  const total = accounts.reduce((sum, a) => sum + a.computedBalance, 0);

  return (
    <>
      <div className="border border-border-muted rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-accent">Account</TableHead>
              <TableHead className="text-right bg-accent">Balance</TableHead>
              <TableHead className="text-right bg-accent">
                Cleared Balance
              </TableHead>
              <TableHead className="text-right bg-accent">
                Last Reconcile
              </TableHead>
              <TableHead className="text-right bg-accent">
                Remaining Credit
              </TableHead>
              <TableHead className="bg-accent" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer"
                onClick={() => navigate(`/accounts/${account.id}`)}
              >
                <TableCell className="font-medium">{account.name}</TableCell>
                <TableCell className="text-right">
                  <Amount value={account.computedBalance} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={account.clearedBalance} />
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {account.lastReconcileDate
                    ? formatDate(account.lastReconcileDate)
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  {account.type === "credit_card" &&
                  account.creditLimit != null ? (
                    <Amount
                      value={account.creditLimit + account.computedBalance}
                    />
                  ) : null}
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit"
                      onClick={() => setEditingId(account.id)}
                    >
                      <EditIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Reconcile"
                      onClick={() => setReconcileAccount(account)}
                    >
                      <CheckCircle2Icon className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">
                <Amount value={total} />
              </TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {reconcileAccount && (
        <ReconciliationDialog
          account={reconcileAccount}
          open={!!reconcileAccount}
          onOpenChange={(open) => !open && setReconcileAccount(null)}
        />
      )}

      <AccountForm
        open={formOpen || editingId != null}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setEditingId(null);
          } else {
            setFormOpen(true);
          }
        }}
        editingId={editingId}
        account={editingAccount}
      />
    </>
  );
}
