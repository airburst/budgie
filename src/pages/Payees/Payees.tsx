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
import { usePayees } from "@/hooks/usePayees";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import Layout from "../layout";
import { PayeeForm } from "./PayeeForm";

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

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const sorted = useMemo(
    () => [...payees].sort((a, b) => a.name.localeCompare(b.name)),
    [payees],
  );

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
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Payees</h1>
          <Button onClick={openAdd} size="sm">
            <PlusIcon />
            New Payee
          </Button>
        </div>

        <div className="border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-accent">Name</TableHead>
                <TableHead className="bg-accent">Default category</TableHead>
                <TableHead className="bg-accent">Default amount</TableHead>
                <TableHead className="bg-accent" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-12"
                  >
                    No payees yet. They are added automatically when you save a
                    transaction.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((payee) => (
                  <TableRow key={payee.id}>
                    <TableCell className="font-medium">{payee.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payee.categoryId
                        ? (categoryMap.get(payee.categoryId) ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatAmount(payee.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(payee.id)}
                          aria-label="Edit payee"
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPendingDeleteId(payee.id)}
                          aria-label="Delete payee"
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
