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
import { useNavigate } from "react-router";

type AccountsTableProps = {
  accounts: Account[];
};

export function AccountsTable({ accounts }: AccountsTableProps) {
  const navigate = useNavigate();

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
