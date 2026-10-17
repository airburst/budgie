import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";
import type { Account, ScheduledTransaction } from "@/types/electron";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  ReceiptText,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { FrequencyBadge } from "./FrequencyBadge";
import {
  SORT_FIELD_LABELS,
  SORT_OPTIONS,
  scheduleStatusText,
  type SortField,
} from "./scheduled-display";

type ScheduledListProps = {
  scheduledTransactions: ScheduledTransaction[];
  accounts: Account[];
  /** Tapping a card (outside its controls) opens read-only details. */
  onView: (id: number) => void;
  /** Explicit action; the only way to record money from the list. */
  onRecord: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  /** Rendered instead of cards when there is nothing to show. */
  emptyContent?: React.ReactNode;
};

type EnrichedRow = ScheduledTransaction & { accountName: string };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, EnrichedRow>();

// Phone: payee | amount. Desktop: due / payee / amount / frequency / account / actions.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[6rem_minmax(0,1fr)_7rem_6rem_minmax(8rem,12rem)_auto] lg:gap-x-4";

export function ScheduledList({
  scheduledTransactions,
  accounts,
  onView,
  onRecord,
  onEdit,
  onDelete,
  emptyContent,
}: ScheduledListProps) {
  const [pendingDelete, setPendingDelete] = useState<EnrichedRow | null>(null);
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

  // Sorting state and row model stay TanStack; only rendering is custom.
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
        }),
        columnHelper.accessor("payee", { header: "Payee" }),
        columnHelper.accessor("amount", { header: "Amount" }),
        columnHelper.accessor("rrule", {
          id: "frequency",
          header: "Frequency",
          enableSorting: false,
        }),
        columnHelper.accessor("accountName", { header: "Account" }),
      ]),
    [],
  );

  const table = useTable<typeof features, EnrichedRow>({
    features,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const rows = table.getRowModel().rows;
  const activeSort = sorting[0] ?? { id: "nextDueDate", desc: false };
  const sortValue = `${activeSort.id}:${activeSort.desc ? "desc" : "asc"}`;
  const sortFieldLabel =
    SORT_FIELD_LABELS[activeSort.id as SortField] ?? "Next due";
  const sortDirectionText =
    SORT_OPTIONS.find((o) => o.value === sortValue)?.label ?? sortFieldLabel;

  return (
    <>
      {rows.length === 0 ? (
        emptyContent
      ) : (
        <div className="flex flex-col gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="min-h-11 self-start md:min-h-8"
                  aria-label={`Sort: ${sortDirectionText}`}
                />
              }
            >
              <span>Sort: {sortFieldLabel}</span>
              {activeSort.desc ? (
                <ArrowDownIcon aria-hidden="true" />
              ) : (
                <ArrowUpIcon aria-hidden="true" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuRadioGroup
                value={sortValue}
                onValueChange={(value) => {
                  const option = SORT_OPTIONS.find((o) => o.value === value);
                  if (option) {
                    setSorting([{ id: option.field, desc: option.desc }]);
                  }
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    closeOnClick
                    className="min-h-11 md:min-h-8"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
            {/* Visual column captions only; each card carries its own labels. */}
            <div
              aria-hidden="true"
              className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
            >
              <span>Due</span>
              <span>Payee</span>
              <span className="text-right">Amount</span>
              <span>Frequency</span>
              <span>Account</span>
              <span />
            </div>
            <ul
              aria-label="Subscriptions"
              className="col-span-full grid grid-cols-subgrid gap-y-2"
            >
              {rows.map((row) => (
                <ScheduledCard
                  key={row.id}
                  item={row.original}
                  onView={onView}
                  onRecord={onRecord}
                  onEdit={onEdit}
                  onDeleteRequest={() => setPendingDelete(row.original)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete subscription?"
        description={
          pendingDelete
            ? `This will permanently delete the ${pendingDelete.payee} subscription. This action cannot be undone.`
            : "This will permanently delete this subscription. This action cannot be undone."
        }
        onConfirm={() => pendingDelete && onDelete(pendingDelete.id)}
      />
    </>
  );
}

type ScheduledCardProps = {
  item: EnrichedRow;
  onView: (id: number) => void;
  onRecord: (id: number) => void;
  onEdit: (id: number) => void;
  onDeleteRequest: () => void;
};

function ScheduledCard({
  item,
  onView,
  onRecord,
  onEdit,
  onDeleteRequest,
}: ScheduledCardProps) {
  const status = scheduleStatusText(item);

  return (
    <li
      data-slot="scheduled-card"
      data-active={item.active ? "true" : "false"}
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-start gap-y-2 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 lg:items-center has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring",
        !item.active && "border-dashed",
      )}
    >
      {/* Whole-card tap opens read-only details; it never records money. */}
      <button
        type="button"
        onClick={() => onView(item.id)}
        className="col-start-1 row-start-1 min-w-0 text-left font-medium break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] lg:col-start-2"
      >
        {item.payee}
      </button>
      <p
        data-slot="scheduled-amount"
        className="col-start-2 row-start-1 text-right font-semibold tabular-nums lg:col-start-3"
      >
        <span className="sr-only">Amount </span>
        <Amount value={item.amount} />
      </p>

      {/* Phone: one wrapping metadata line. Desktop: each cell is its own column. */}
      <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:contents lg:text-sm">
        <p className="lg:col-start-1 lg:row-start-1">
          <span className="lg:sr-only">Next due </span>
          {item.nextDueDate ? formatDate(item.nextDueDate) : "not set"}
        </p>
        <p className="lg:col-start-4 lg:row-start-1">
          <span className="sr-only">Repeats </span>
          <FrequencyBadge rruleStr={item.rrule} />
        </p>
        <p className="min-w-0 break-words lg:col-start-5 lg:row-start-1">
          <span className="sr-only">Account </span>
          {item.accountName}
        </p>
        {status.length > 0 && (
          <p
            data-slot="scheduled-status"
            className="font-medium text-foreground lg:col-start-2 lg:row-start-2 lg:text-xs"
          >
            {status.join(" · ")}
          </p>
        )}
      </div>

      <div className="relative z-10 col-span-full flex items-center justify-between gap-2 lg:col-span-1 lg:col-start-6 lg:row-start-1 lg:justify-end">
        <Button
          variant="ghost"
          className="min-h-11 border-border lg:size-8 lg:min-h-0 lg:border-transparent lg:p-0"
          aria-label={`Record payment for ${item.payee}`}
          title="Record payment"
          onClick={() => onRecord(item.id)}
        >
          <ReceiptText />
          <span className="lg:sr-only">Record payment</span>
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:size-8"
            title="Edit"
            aria-label={`Edit ${item.payee}`}
            onClick={() => onEdit(item.id)}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:size-8"
            title="Delete"
            aria-label={`Delete ${item.payee}`}
            onClick={onDeleteRequest}
          >
            <Trash2Icon className="text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}
