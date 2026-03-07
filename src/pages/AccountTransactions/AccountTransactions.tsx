import AccountsMenu from "@/components/AccountsMenu/accounts-menu";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import Layout from "../layout";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionSheet } from "./TransactionSheet";
import { TransactionsTable } from "./TransactionsTable";
import { useTransactions } from "@/hooks/useTransactions";

type Filter = "all" | "income" | "expenses";

export default function AccountTransactions() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);

  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { transactions, categories, remove } = useTransactions(accountId);

  const filtered = transactions.filter((t) => {
    if (filter === "income") return t.amount > 0;
    if (filter === "expenses") return t.amount < 0;
    return true;
  });

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
      <div className="flex flex-row h-full">
        <AccountsMenu />
        <div className="flex flex-col flex-1 overflow-y-auto p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <div className="flex items-center gap-3">
              <TransactionFilters value={filter} onChange={setFilter} />
              <Button onClick={openAdd} size="sm">
                <PlusIcon />
                Add Transaction
              </Button>
            </div>
          </div>
          <TransactionsTable
            transactions={filtered}
            categories={categories}
            onEdit={openEdit}
            onDelete={(id) => remove.mutate(id)}
          />
        </div>
      </div>
      <TransactionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
        accountId={accountId}
      />
    </Layout>
  );
}
