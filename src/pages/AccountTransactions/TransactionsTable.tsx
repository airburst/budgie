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
import type { Category, Transaction } from "@/types/electron";
import { CheckIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";

type TransactionsTableProps = {
  transactions: Transaction[];
  categories: Category[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function TransactionsTable({
  transactions,
  categories,
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  if (transactions.length === 0) {
    return (
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-accent">Date</TableHead>
              <TableHead className="bg-accent">Payee</TableHead>
              <TableHead className="bg-accent">Category</TableHead>
              <TableHead className="text-right bg-accent">Amount</TableHead>
              <TableHead className="text-center bg-accent">Cleared</TableHead>
              <TableHead className="bg-accent" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={6}
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
    <div className="border border-border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-accent">Date</TableHead>
            <TableHead className="bg-accent">Payee</TableHead>
            <TableHead className="bg-accent">Category</TableHead>
            <TableHead className="text-right bg-accent">Amount</TableHead>
            <TableHead className="text-center bg-accent">Cleared</TableHead>
            <TableHead className="bg-accent" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const category = tx.categoryId
              ? categoryMap.get(tx.categoryId)
              : null;
            return (
              <TableRow key={tx.id}>
                <TableCell className="text-muted-foreground text-sm">
                  {tx.date}
                </TableCell>
                <TableCell className="font-medium">{tx.payee}</TableCell>
                <TableCell>
                  {category ? (
                    <Badge
                      variant="secondary"
                      style={
                        category.color
                          ? {
                              backgroundColor: category.color + "22",
                              color: category.color,
                            }
                          : undefined
                      }
                    >
                      {category.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={tx.amount} />
                </TableCell>
                <TableCell className="text-center">
                  {tx.cleared ? (
                    <CheckIcon className="size-4 text-green-600 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
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
                      onClick={() => onDelete(tx.id)}
                      aria-label="Delete transaction"
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
  );
}
