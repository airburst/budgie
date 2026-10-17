import { AccountContextCard } from "@/components/AccountsMenu/account-context-card";
import AccountsMenu from "@/components/AccountsMenu/accounts-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAccounts } from "@/hooks/useAccounts";
import { useHotkeys } from "@/hooks/useHotkeys";
import { usePreferences } from "@/hooks/usePreferences";
import { useTransactions } from "@/hooks/useTransactions";
import type { Preferences } from "@/types/electron";
import {
  CheckSquareIcon,
  EditIcon,
  FunnelIcon,
  ImportIcon,
  LineChartIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AccountForm } from "../Home/AccountForm";
import Layout from "../layout";
import { ImportDialog } from "./ImportDialog";
import { ReconciliationDialog } from "./ReconciliationDialog";
import { TransactionForm } from "./TransactionForm";
import { TransactionsList } from "./TransactionsList";

export default function AccountTransactions() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);

  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [focusAmountOnOpen, setFocusAmountOnOpen] = useState(false);
  const [formMode, setFormMode] = useState<"details" | "edit">("edit");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [importData, setImportData] = useState<{
    content: string;
    filename: string;
  } | null>(null);

  const { transactions, categories, update, remove } =
    useTransactions(accountId);
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const { preferences, update: updatePreferences } = usePreferences();

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        if (preferences.hideReconciled && t.reconciled) return false;
        if (preferences.hideCleared && t.cleared && !t.reconciled) return false;
        return true;
      }),
    [transactions, preferences],
  );

  function setPreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    updatePreferences.mutate({ ...preferences, [key]: value });
  }

  // Text summary so the active state is never color-only.
  const activeFilters = [
    preferences.hideReconciled && "reconciled",
    preferences.hideCleared && "cleared",
  ].filter((v): v is string => !!v);
  const filterSummary = activeFilters.length
    ? `Hiding ${activeFilters.join(" & ")}`
    : "";

  function openAdd() {
    setEditingId(null);
    setFocusAmountOnOpen(false);
    setFormMode("edit");
    setSheetOpen(true);
  }

  function openEdit(id: number, options?: { focusAmount?: boolean }) {
    setEditingId(id);
    setFocusAmountOnOpen(!!options?.focusAmount);
    setFormMode("edit");
    setSheetOpen(true);
  }

  function openDetails(id: number) {
    setEditingId(id);
    setFocusAmountOnOpen(false);
    setFormMode("details");
    setSheetOpen(true);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) setFocusAmountOnOpen(false);
  }

  async function handleImport() {
    const filePath = await window.api.chooseQifFile();
    if (!filePath) return;
    const content = await window.api.readQifFile(filePath);
    const filename = filePath.split("/").pop() ?? filePath;
    setImportData({ content, filename });
  }

  useHotkeys(
    [
      { key: "f", handler: () => navigate(`/forecast/${accountId}`) },
      { key: "r", handler: () => setReconcileOpen(true) },
      { key: "n", handler: () => openAdd() },
    ],
    !sheetOpen && !reconcileOpen,
  );

  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-row">
        <AccountsMenu />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          <AccountContextCard
            account={account}
            accounts={accounts}
            className="mb-6 lg:hidden"
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Filter transactions${
                        filterSummary ? `, ${filterSummary}` : ""
                      }`}
                    />
                  }
                >
                  <FunnelIcon />
                  Filter
                  {filterSummary && (
                    <>
                      <span className="sm:hidden">
                        · {activeFilters.length}
                      </span>
                      <span className="hidden sm:inline">
                        · {filterSummary}
                      </span>
                    </>
                  )}
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    View filters
                  </p>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        id="filter-reconciled"
                        type="checkbox"
                        checked={preferences.hideReconciled}
                        onChange={(e) =>
                          setPreference("hideReconciled", e.target.checked)
                        }
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor="filter-reconciled"
                        className="cursor-pointer font-normal"
                      >
                        Hide reconciled
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="filter-cleared"
                        type="checkbox"
                        checked={preferences.hideCleared}
                        onChange={(e) =>
                          setPreference("hideCleared", e.target.checked)
                        }
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor="filter-cleared"
                        className="cursor-pointer font-normal"
                      >
                        Hide cleared
                      </Label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button onClick={openAdd} size="sm">
                <PlusIcon />
                Add
              </Button>
              {/* Desktop keeps direct actions; below lg they collapse into More. */}
              <div className="hidden items-center gap-3 lg:flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReconcileOpen(true)}
                >
                  <CheckSquareIcon />
                  Reconcile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/forecast/${accountId}`)}
                >
                  <LineChartIcon />
                  Forecast
                </Button>
                <Button variant="outline" size="sm" onClick={handleImport}>
                  <ImportIcon />
                  Import
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="size-11 md:size-8 lg:hidden"
                      aria-label="More actions"
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    className="min-h-11 md:min-h-8"
                    onClick={() => setReconcileOpen(true)}
                  >
                    <CheckSquareIcon />
                    Reconcile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-11 md:min-h-8"
                    onClick={() => navigate(`/forecast/${accountId}`)}
                  >
                    <LineChartIcon />
                    Forecast
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-11 md:min-h-8"
                    onClick={() => setAccountFormOpen(true)}
                  >
                    <EditIcon />
                    Edit account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-11 md:min-h-8"
                    onClick={handleImport}
                  >
                    <ImportIcon />
                    Import
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <TransactionsList
            transactions={filtered}
            allTransactions={transactions.filter(
              (t) => !t.cleared && !t.reconciled,
            )}
            categories={categories}
            openingBalance={account?.clearedBalance ?? account?.balance ?? 0}
            onEdit={openEdit}
            onView={openDetails}
            onDelete={(id) => remove.mutate(id)}
            onToggleCleared={(id, cleared) =>
              update.mutate({ id, data: { cleared } })
            }
          />
        </div>
      </div>
      <TransactionForm
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        editingId={editingId}
        accountId={accountId}
        account={account}
        focusAmountOnOpen={focusAmountOnOpen}
        initialMode={formMode}
      />
      {account && (
        <ReconciliationDialog
          account={account}
          open={reconcileOpen}
          onOpenChange={setReconcileOpen}
        />
      )}
      <AccountForm
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        editingId={accountId}
        account={account}
      />
      {importData && (
        <ImportDialog
          open={!!importData}
          onOpenChange={(open) => !open && setImportData(null)}
          accountId={accountId}
          qifContent={importData.content}
          filename={importData.filename}
        />
      )}
    </Layout>
  );
}
