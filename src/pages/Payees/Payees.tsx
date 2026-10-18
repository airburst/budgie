import { HeaderAction } from "@/components/page-chrome";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { SearchBox } from "@/components/SearchBox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCategories } from "@/hooks/useCategories";
import { usePayees } from "@/hooks/usePayees";
import { cn } from "@/lib/utils";
import type { Payee } from "@/types/electron";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Layout from "../layout";
import { PayeeForm } from "./PayeeForm";

// Phone: payee | amount (menu on the second row). Desktop: payee / category / amount / actions.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)_7rem_auto] lg:gap-x-4";

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  if (amount < 0) return `−${Math.abs(amount).toFixed(2)}`;
  return `+${amount.toFixed(2)}`;
}

export default function Payees() {
  const { payees, remove } = usePayees();
  const { categories } = useCategories();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  // The id is kept after closing so the surface doesn't blank mid-animation.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const sorted = useMemo(() => {
    const lower = search.toLowerCase();
    return [...payees]
      .filter((p) => !lower || p.name.toLowerCase().includes(lower))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payees, search]);

  const categoryName = (payee: Payee) =>
    payee.categoryId ? (categoryMap.get(payee.categoryId) ?? null) : null;
  const detailsPayee =
    detailsId != null ? payees.find((p) => p.id === detailsId) : null;

  function openAdd() {
    setEditingId(null);
    setFormOpen(true);
  }

  function openEdit(id: number) {
    setEditingId(id);
    setFormOpen(true);
  }

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 md:mb-6">
          {/* The phone header already shows the route title. */}
          <h1 className="sr-only text-2xl font-bold tracking-tight md:not-sr-only">
            Payees
          </h1>
          <HeaderAction>
            <Button className="ml-auto" onClick={openAdd} size="sm">
              <PlusIcon />
              New Payee
            </Button>
          </HeaderAction>
        </div>

        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search payees…"
          className="mb-4"
        />

        {sorted.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-12 text-center text-muted-foreground">
            {search
              ? "No payees match your search."
              : "No payees yet. They are added automatically when you save a transaction."}
          </div>
        ) : (
          <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
            {/* Visual column captions only; each card carries its own labels. */}
            <div
              aria-hidden="true"
              className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
            >
              <span>Payee</span>
              <span>Default category</span>
              <span className="text-right">Default amount</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
              {sorted.map((payee) => (
                <PayeeCard
                  key={payee.id}
                  payee={payee}
                  categoryName={categoryName(payee)}
                  onView={() => {
                    setDetailsId(payee.id);
                    setDetailsOpen(true);
                  }}
                  onEdit={() => openEdit(payee.id)}
                  onDelete={() => setPendingDeleteId(payee.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <PayeeDetails
        payee={detailsPayee ?? null}
        categoryName={detailsPayee ? categoryName(detailsPayee) : null}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onEdit={(id) => {
          setDetailsOpen(false);
          openEdit(id);
        }}
      />

      <PayeeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingId={editingId}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete payee?"
        description="This will remove this payee from the suggestions list. Past transactions are not affected."
        onConfirm={() => remove.mutate(pendingDeleteId!)}
      />
    </Layout>
  );
}

type PayeeCardProps = {
  payee: Payee;
  categoryName: string | null;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function PayeeCard({
  payee,
  categoryName,
  onView,
  onEdit,
  onDelete,
}: PayeeCardProps) {
  return (
    <li
      data-slot="payee-card"
      className="relative col-span-full grid grid-cols-subgrid items-center gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring"
    >
      {/* The button's pseudo-element makes the whole card open details. */}
      <button
        type="button"
        onClick={onView}
        className="col-start-1 row-start-1 min-w-0 text-left font-medium break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] lg:self-center"
      >
        {payee.name}
      </button>

      <p
        data-slot="payee-amount"
        className="col-start-2 row-start-1 text-right font-semibold tabular-nums lg:col-start-3"
      >
        <span className="sr-only">Default amount </span>
        {formatAmount(payee.amount)}
      </p>

      <p className="col-start-1 row-start-2 min-w-0 text-xs break-words text-muted-foreground lg:col-start-2 lg:row-start-1 lg:text-sm">
        <span className="sr-only">Default category </span>
        {categoryName ?? "No default category"}
      </p>

      <div className="relative z-10 col-start-2 row-start-2 flex justify-end lg:col-start-4 lg:row-start-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:size-8 lg:hidden"
                aria-label={`More actions for ${payee.name}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="min-h-11 md:min-h-8" onClick={onEdit}>
              <PencilIcon />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              variant="destructive"
              onClick={onDelete}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden gap-2 lg:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Edit"
            aria-label={`Edit ${payee.name}`}
            onClick={onEdit}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Delete"
            aria-label={`Delete ${payee.name}`}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

type PayeeDetailsProps = {
  payee: Payee | null;
  categoryName: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
};

/** Read-only summary shown before an explicit Edit. Contains no inputs. */
function PayeeDetails({
  payee,
  categoryName,
  open,
  onClose,
  onEdit,
}: PayeeDetailsProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <ResponsiveOverlay open={open} onOpenChange={(next) => !next && onClose()}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-sm"
        initialFocus={titleRef}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle
            ref={titleRef}
            tabIndex={-1}
            className="break-words"
          >
            {payee?.name ?? "Payee"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Payee details
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <ResponsiveOverlayBody>
          {payee && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Default category</dt>
              <dd className="break-words">{categoryName ?? "None"}</dd>
              <dt className="text-muted-foreground">Default amount</dt>
              <dd className="tabular-nums">{formatAmount(payee.amount)}</dd>
            </dl>
          )}
        </ResponsiveOverlayBody>
        <ResponsiveOverlayFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {payee && <Button onClick={() => onEdit(payee.id)}>Edit</Button>}
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
