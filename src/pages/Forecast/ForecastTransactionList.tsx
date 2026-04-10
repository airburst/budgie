import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ForecastRow } from "@/lib/forecast";
import { formatDate } from "@/lib/utils";
import type { Category } from "@/types/electron";

export type ForecastRowWithBalance = ForecastRow & {
  included: boolean;
  runningBalance: number;
};

type Props = {
  rows: ForecastRowWithBalance[];
  categoryMap: Map<number, Category>;
  onToggleRow: (key: string) => void;
};

export function ForecastTransactionList({
  rows,
  categoryMap,
  onToggleRow,
}: Props) {
  return (
    <div className="border border-border rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-accent">Date</TableHead>
            <TableHead className="bg-accent">Payee</TableHead>
            <TableHead className="text-right bg-accent">Withdrawal</TableHead>
            <TableHead className="text-right bg-accent">Deposit</TableHead>
            <TableHead className="bg-accent">Category</TableHead>
            <TableHead className="bg-accent">Memo</TableHead>
            <TableHead className="text-right bg-accent">Balance</TableHead>
            <TableHead className="text-center bg-accent">Include</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-muted-foreground py-12"
              >
                No projected transactions in this period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const category = row.categoryId
                ? categoryMap.get(row.categoryId)
                : null;
              return (
                <TableRow
                  key={row.key}
                  className={
                    row.isScheduled ? "text-muted-foreground italic" : undefined
                  }
                >
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.payee}</TableCell>
                  <TableCell className="text-right">
                    {row.amount < 0 ? <Amount value={row.amount} /> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.amount > 0 ? <Amount value={row.amount} /> : null}
                  </TableCell>
                  <TableCell>
                    {category ? (
                      <Badge variant="secondary">{category.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                    {row.notes ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.included ? (
                      <Amount value={row.runningBalance} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={() => onToggleRow(row.key)}
                      className="cursor-pointer accent-blue-500 size-4"
                      aria-label="Include in forecast"
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
