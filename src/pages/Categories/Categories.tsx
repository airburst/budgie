import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCategories } from "@/hooks/useCategories";
import {
  CornerDownRightIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import Layout from "../layout";
import { CategorySheet } from "./CategoryForm";

export default function Categories() {
  const { categories, remove } = useCategories();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newSubParentId, setNewSubParentId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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
    const topLevel = categories.filter((c) => c.parentId === null);
    const childrenMap = new Map<number, typeof categories>();
    for (const c of categories) {
      if (c.parentId !== null) {
        const arr = childrenMap.get(c.parentId) ?? [];
        arr.push(c);
        childrenMap.set(c.parentId, arr);
      }
    }
    return { topLevel, childrenMap };
  }, [categories]);

  const childrenOf = (id: number) => childrenMap.get(id) ?? [];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <Button onClick={() => openAdd()} size="sm">
            <PlusIcon />
            New Category
          </Button>
        </div>

        <div className="border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-accent">Name</TableHead>
                <TableHead className="bg-accent">Type</TableHead>
                <TableHead className="bg-accent" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-12"
                  >
                    No categories yet.
                  </TableCell>
                </TableRow>
              ) : (
                topLevel.flatMap((cat) => [
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">
                      {cat.expenseType}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openAdd(cat.id)}
                          aria-label="Add sub-category"
                        >
                          <FolderPlusIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(cat.id)}
                          aria-label="Edit category"
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPendingDeleteId(cat.id)}
                          aria-label="Delete category"
                          disabled={childrenOf(cat.id).length > 0}
                          title={
                            childrenOf(cat.id).length > 0
                              ? "Remove sub-categories first"
                              : undefined
                          }
                        >
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ...childrenOf(cat.id).map((child) => (
                    <TableRow key={child.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2 pl-4">
                          <CornerDownRightIcon className="size-3 shrink-0 text-muted-foreground" />
                          {child.name}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">
                        {child.expenseType}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(child.id)}
                            aria-label="Edit category"
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPendingDeleteId(child.id)}
                            aria-label="Delete category"
                          >
                            <Trash2Icon className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )),
                ])
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
