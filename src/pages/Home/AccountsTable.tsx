import { Amount } from "@/components/ui/amount";
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

type AccountsTableProps = {
  accounts: Account[];
};

export function AccountsTable({ accounts }: AccountsTableProps) {
  return (
    <div className="border border-border-muted rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={account.id}>
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
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className="text-right">
              <Amount value={2500} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
