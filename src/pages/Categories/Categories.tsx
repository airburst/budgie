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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import Layout from "../layout";
import { CategorySheet } from "./CategorySheet";
import { useCategories } from "@/hooks/useCategories";

export default function Categories() {
  const { categories, remove } = useCategories();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  function openAdd() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(id: number) {
    setEditingId(id);
    setSheetOpen(true);
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <Button onClick={openAdd} size="sm">
            <PlusIcon />
            New Category
          </Button>
        </div>

        <div className="border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-accent">Name</TableHead>
                <TableHead className="bg-accent">Colour</TableHead>
                <TableHead className="bg-accent">Icon</TableHead>
                <TableHead className="bg-accent" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-12"
                  >
                    No categories yet.
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      {cat.color ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block size-4 rounded-full border border-border"
                            style={{ backgroundColor: cat.color }}
                          />
                          <Badge
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {cat.color}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {cat.icon ? (
                        <span className="text-sm font-mono text-muted-foreground">
                          {cat.icon}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
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
                        >
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CategorySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
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
