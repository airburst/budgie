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
import { cn, formatDate } from "@/lib/utils";
import type { Account, ScheduledTransaction } from "@/types/electron";
import {
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  PencilIcon,
  ReceiptText,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { FrequencyBadge } from "./FrequencyBadge";

type ScheduledTableProps = {
  scheduledTransactions: ScheduledTransaction[];
  accounts: Account[];
  onRecord: (id: number, options?: { focusAmount?: boolean }) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

type EnrichedRow = ScheduledTransaction & { accountName: string };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, EnrichedRow>();

export function ScheduledTable({
  scheduledTransactions,
  accounts,
  onRecord,
  onEdit,
  onDelete,
}: ScheduledTableProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "nextDueDate", desc: false },
  ]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const data = useMemo<EnrichedRow[]>(
    () =>
      scheduledTransactions.map((s) => ({
        ...s,
        accountName: accountMap.get(s.accountId)?.name ?? "—",
      })),
    [scheduledTransactions, accountMap],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("nextDueDate", {
          header: "Next Due",
          sortFn: (rowA, rowB) => {
            const a = rowA.original.nextDueDate;
            const b = rowB.original.nextDueDate;
            if (!a && !b) return 0;
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
          },
          cell: ({ getValue }) => (
            <span className="text-sm text-muted-foreground">
              {getValue() ? formatDate(getValue()!) : "—"}
            </span>
          ),
        }),
        columnHelper.accessor("payee", {
          header: "Payee",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
        }),
        columnHelper.accessor("amount", {
          header: "Amount",
          cell: ({ getValue }) => (
            <div className="text-right">
              <Amount value={getValue()} />
            </div>
          ),
        }),
        columnHelper.accessor("rrule", {
          id: "frequency",
          header: "Frequency",
          enableSorting: false,
          cell: ({ getValue }) => <FrequencyBadge rruleStr={getValue()} />,
        }),
        columnHelper.accessor("accountName", {
          header: "Account",
          cell: ({ getValue }) => (
            <span className="text-sm text-muted-foreground">{getValue()}</span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          cell: ({ row }) => (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecord(row.original.id);
                }}
                aria-label="Record payment"
              >
                <ReceiptText />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row.original.id);
                }}
                aria-label="Edit scheduled payment"
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(row.original.id);
                }}
                aria-label="Delete scheduled payment"
              >
                <Trash2Icon className="text-destructive" />
              </Button>
            </div>
          ),
        }),
      ]),
    [onRecord, onEdit],
  );

  const table = useTable<typeof features, EnrichedRow>({
    features,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <>
      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "bg-accent",
                      header.column.getCanSort() &&
                        "cursor-pointer select-none",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          header.column.id === "amount" && "justify-end",
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() &&
                          (header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="h-3 w-3 shrink-0" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          ))}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-12"
                >
                  No subscriptions yet.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "cursor-pointer",
                    !row.original.active && "opacity-50",
                  )}
                  onDoubleClick={() =>
                    onRecord(row.original.id, { focusAmount: true })
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete subscription?"
        description="This will permanently delete this subscription. This action cannot be undone."
        onConfirm={() => onDelete(pendingDeleteId!)}
      />
    </>
  );
}
