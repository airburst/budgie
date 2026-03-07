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
import { type Account } from "@/types";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AccountForm } from "./AccountForm";

type AccountsTableProps = {
  accounts: Account[];
};

export function AccountsTable({ accounts }: AccountsTableProps) {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);

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

  return (
    <div className="border border-border-muted rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-25 bg-accent">Account</TableHead>
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
                <Amount value={account.balance} />
              </TableCell>
              <TableCell className="text-right">
                <Amount value={account.balance} />
              </TableCell>
              <TableCell className="text-right"></TableCell>
              <TableCell className="text-right"></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell>Total</TableCell>
            <TableCell className="text-right">
              <Amount value={2500} />
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
