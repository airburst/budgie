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
import { cn } from "@/lib/utils";
import type { Category } from "@/types/electron";
import {
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Layout from "../layout";
import { CategorySheet } from "./CategoryForm";

// Phone: name | menu. Desktop: name / type / actions.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[minmax(0,1fr)_7rem_auto] lg:gap-x-4";

function subCategoryCount(n: number) {
  return `${n} sub-categor${n === 1 ? "y" : "ies"}`;
}

export default function Categories() {
  const { categories, remove } = useCategories();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newSubParentId, setNewSubParentId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  // The id is kept after closing so the surface doesn't blank mid-animation.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");

  function openAdd(parentId?: number) {
    setEditingId(null);
    setNewSubParentId(parentId ?? null);
    setSheetOpen(true);
  }

  function openEdit(id: number) {
    setEditingId(id);
    setNewSubParentId(null);
    setSheetOpen(true);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) setNewSubParentId(null);
  }

  const { topLevel, childrenMap } = useMemo(() => {
    const lower = search.toLowerCase();
    const allTopLevel = categories.filter(
      (c) => c.parentId === null && c.expenseType !== "transfer",
    );
    const childrenMap = new Map<number, typeof categories>();
    for (const c of categories) {
      if (c.parentId !== null) {
        if (!lower || c.name.toLowerCase().includes(lower)) {
          const arr = childrenMap.get(c.parentId) ?? [];
          arr.push(c);
          childrenMap.set(c.parentId, arr);
        }
      }
    }
    const topLevel = allTopLevel.filter(
      (c) =>
        !lower ||
        c.name.toLowerCase().includes(lower) ||
        (childrenMap.get(c.id)?.length ?? 0) > 0,
    );
    return { topLevel, childrenMap };
  }, [categories, search]);

  const childrenOf = (id: number) => childrenMap.get(id) ?? [];
  // Delete eligibility looks at every child, not just those matching the search.
  const hasChildren = (id: number) =>
    categories.some((c) => c.parentId === id);
  const detailsCategory =
    detailsId != null ? categories.find((c) => c.id === detailsId) : null;

  const rows = topLevel.flatMap((cat) => [
    { category: cat, parent: null as Category | null },
    ...childrenOf(cat.id).map((child) => ({ category: child, parent: cat })),
  ]);

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3 md:mb-6">
          {/* The phone header already shows the route title. */}
          <h1 className="sr-only text-2xl font-bold tracking-tight md:not-sr-only">
            Categories
          </h1>
          <Button className="ml-auto" onClick={() => openAdd()} size="sm">
            <PlusIcon />
            New Category
          </Button>
        </div>

        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search categories…"
          className="mb-4"
        />

        {rows.length === 0 ? (
          <div className="rounded-md border border-border py-12 text-center text-muted-foreground">
            {search ? "No categories match your search." : "No categories yet."}
          </div>
        ) : (
          <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
            {/* Visual column captions only; each card carries its own labels. */}
            <div
              aria-hidden="true"
              className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
            >
              <span>Name</span>
              <span>Type</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
              {rows.map(({ category, parent }) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  parent={parent}
                  childCount={parent ? 0 : childrenOf(category.id).length}
                  canDelete={!hasChildren(category.id)}
                  onView={() => {
                    setDetailsId(category.id);
                    setDetailsOpen(true);
                  }}
                  onAddChild={() => openAdd(category.id)}
                  onEdit={() => openEdit(category.id)}
                  onDelete={() => setPendingDeleteId(category.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <CategoryDetails
        category={detailsCategory ?? null}
        parentName={
          detailsCategory?.parentId != null
            ? categories.find((c) => c.id === detailsCategory.parentId)?.name
            : undefined
        }
        childNames={
          detailsCategory
            ? categories
                .filter((c) => c.parentId === detailsCategory.id)
                .map((c) => c.name)
            : []
        }
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onEdit={(id) => {
          setDetailsOpen(false);
          openEdit(id);
        }}
      />

      <CategorySheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        editingId={editingId}
        parentId={newSubParentId}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete category?"
        description="This will permanently delete this category. This action cannot be undone."
        onConfirm={() => remove.mutate(pendingDeleteId!)}
      />
    </Layout>
  );
}

type CategoryCardProps = {
  category: Category;
  parent: Category | null;
  childCount: number;
  canDelete: boolean;
  onView: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function CategoryCard({
  category,
  parent,
  childCount,
  canDelete,
  onView,
  onAddChild,
  onEdit,
  onDelete,
}: CategoryCardProps) {
  const context = parent
    ? `Sub-category of ${parent.name}`
    : childCount > 0
      ? subCategoryCount(childCount)
      : null;
  const deleteHint = canDelete ? undefined : "Remove sub-categories first";

  return (
    <li
      data-slot="category-card"
      data-child={parent ? "true" : undefined}
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-center gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring",
        parent && "ml-4 border-l-4 lg:ml-8",
      )}
    >
      <div className="min-w-0">
        {/* The button's pseudo-element makes the whole card open details. */}
        <button
          type="button"
          onClick={onView}
          className="text-left font-medium break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {category.name}
        </button>
        {context && (
          <p className="hidden text-xs text-muted-foreground lg:block">
            {context}
          </p>
        )}
      </div>
      <p className="hidden text-sm text-muted-foreground capitalize lg:block">
        <span className="sr-only">Type </span>
        {category.expenseType}
      </p>

      {/* Phone: type · hierarchy context. */}
      <p className="col-start-1 text-xs text-muted-foreground lg:hidden">
        <span className="capitalize">{category.expenseType}</span>
        {context && ` · ${context}`}
      </p>

      <div className="relative z-10 col-start-2 row-start-1 flex justify-end lg:col-start-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:size-8 lg:hidden"
                aria-label={`More actions for ${category.name}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!parent && (
              <DropdownMenuItem
                className="min-h-11 md:min-h-8"
                onClick={onAddChild}
              >
                <FolderPlusIcon />
                Add sub-category
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="min-h-11 md:min-h-8" onClick={onEdit}>
              <PencilIcon />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              variant="destructive"
              disabled={!canDelete}
              onClick={onDelete}
            >
              <Trash2Icon />
              {canDelete ? "Delete" : "Delete (remove sub-categories first)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden gap-2 lg:flex">
          {!parent && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Add sub-category"
              aria-label={`Add sub-category to ${category.name}`}
              onClick={onAddChild}
            >
              <FolderPlusIcon className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Edit"
            aria-label={`Edit ${category.name}`}
            onClick={onEdit}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={deleteHint ?? "Delete"}
            aria-label={`Delete ${category.name}`}
            disabled={!canDelete}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

type CategoryDetailsProps = {
  category: Category | null;
  parentName?: string;
  childNames: string[];
  open: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
};

/** Read-only summary shown before an explicit Edit. Contains no inputs. */
function CategoryDetails({
  category,
  parentName,
  childNames,
  open,
  onClose,
  onEdit,
}: CategoryDetailsProps) {
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
            {category?.name ?? "Category"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Category details
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <ResponsiveOverlayBody>
          {category && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="capitalize">{category.expenseType}</dd>
              <dt className="text-muted-foreground">Parent</dt>
              <dd className="break-words">{parentName ?? "None (top level)"}</dd>
              <dt className="text-muted-foreground">Sub-categories</dt>
              <dd className="break-words">
                {childNames.length > 0 ? childNames.join(", ") : "None"}
              </dd>
            </dl>
          )}
          {childNames.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Remove its sub-categories before deleting this category.
            </p>
          )}
        </ResponsiveOverlayBody>
        <ResponsiveOverlayFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {category && (
            <Button onClick={() => onEdit(category.id)}>Edit</Button>
          )}
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
