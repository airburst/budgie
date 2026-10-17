import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { accountSummary, remainingCredit } from "@/lib/account-display";
import { cn, formatDate } from "@/lib/utils";
import type { AccountWithBalances } from "@/types/electron";
import {
  CheckCircle2Icon,
  EditIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ReconciliationDialog } from "../AccountTransactions/ReconciliationDialog";
import { AccountForm } from "./AccountForm";

type AccountsListProps = {
  accounts: AccountWithBalances[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
};

// Phone: account | balance | menu. Desktop: one aligned column per value.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 lg:grid-cols-[minmax(10rem,1fr)_repeat(4,auto)_auto] lg:gap-x-8";

export function AccountsList({
  accounts,
  isLoading = false,
  isError = false,
  onRetry,
}: AccountsListProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reconcileAccount, setReconcileAccount] =
    useState<AccountWithBalances | null>(null);

  const editingAccount =
    editingId != null ? accounts.find((a) => a.id === editingId) : null;
  const total = accounts.reduce((sum, a) => sum + a.computedBalance, 0);

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div aria-busy="true" aria-label="Loading accounts" className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (isError) {
    content = (
      <div
        role="alert"
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <p className="text-muted-foreground">Couldn't load your accounts.</p>
        {onRetry && (
          <Button variant="outline" className="min-h-11 md:min-h-8" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  } else if (accounts.length === 0) {
    content = (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">
          No accounts yet. Add your first account to get started.
        </p>
        <Button className="min-h-11 md:min-h-8" onClick={() => setFormOpen(true)}>
          <PlusIcon />
          Add Account
        </Button>
      </div>
    );
  } else {
    content = (
      <>
        <section
          aria-labelledby="accounts-total-label"
          className="rounded-xl border bg-card px-4 py-4"
        >
          <h2
            id="accounts-total-label"
            className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
          >
            All accounts · Total balance
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums md:text-3xl">
            <Amount value={total} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Account balances, not available cash
          </p>
        </section>

        <section aria-labelledby="accounts-list-label" className="mt-6">
          <h2
            id="accounts-list-label"
            className="mb-2 text-sm font-semibold text-muted-foreground"
          >
            Your accounts
          </h2>
          <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
            {/* Visual column captions only; each card carries its own labels. */}
            <div
              aria-hidden="true"
              className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
            >
              <span>Account</span>
              <span className="text-right">Balance</span>
              <span className="text-right">Cleared balance</span>
              <span className="text-right">Last reconcile</span>
              <span className="text-right">Remaining credit</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={() => setEditingId(account.id)}
                  onReconcile={() => setReconcileAccount(account)}
                />
              ))}
            </ul>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* The phone header already shows the route title. */}
        <h1 className="sr-only text-2xl font-bold tracking-tight md:not-sr-only">
          Accounts
        </h1>
        {!isLoading && !isError && accounts.length > 0 && (
          <Button
            className="ml-auto min-h-11 md:min-h-8"
            onClick={() => setFormOpen(true)}
          >
            <PlusIcon />
            Add account
          </Button>
        )}
      </div>

      {content}

      {reconcileAccount && (
        <ReconciliationDialog
          account={reconcileAccount}
          open={!!reconcileAccount}
          onOpenChange={(open) => !open && setReconcileAccount(null)}
        />
      )}

      <AccountForm
        open={formOpen || editingId != null}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setEditingId(null);
          } else {
            setFormOpen(true);
          }
        }}
        editingId={editingId}
        account={editingAccount}
      />
    </>
  );
}

type AccountCardProps = {
  account: AccountWithBalances;
  onEdit: () => void;
  onReconcile: () => void;
};

function AccountCard({ account, onEdit, onReconcile }: AccountCardProps) {
  const credit = remainingCredit(account);
  const lastReconcile = account.lastReconcileDate
    ? formatDate(account.lastReconcileDate)
    : null;

  return (
    <li
      data-slot="account-card"
      className="relative col-span-full grid grid-cols-subgrid items-center gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
    >
      <div className="min-w-0">
        {/* The link's pseudo-element makes the whole card the navigation target. */}
        <Link
          to={`/accounts/${account.id}`}
          className="font-medium break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {account.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {accountSummary(account)}
        </p>
      </div>

      <p
        data-slot="account-balance"
        className="text-right font-semibold tabular-nums"
      >
        <span className="sr-only">Balance </span>
        <Amount value={account.computedBalance} />
      </p>

      <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums lg:hidden">
        <span>
          Cleared <Amount value={account.clearedBalance} />
        </span>
        {lastReconcile && <span>Reconciled {lastReconcile}</span>}
        {credit != null && (
          <span>
            Remaining credit <Amount value={credit} />
          </span>
        )}
      </div>

      <p className="hidden text-right tabular-nums lg:block">
        <span className="sr-only">Cleared balance </span>
        <Amount value={account.clearedBalance} />
      </p>
      <p className="hidden text-right text-sm text-muted-foreground lg:block">
        <span className="sr-only">Last reconcile </span>
        {lastReconcile ?? "Never"}
      </p>
      <p className="hidden text-right tabular-nums lg:block">
        {credit != null && (
          <>
            <span className="sr-only">Remaining credit </span>
            <Amount value={credit} />
          </>
        )}
      </p>

      <div className="relative z-10 col-start-3 row-start-1 flex justify-end lg:col-start-6">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:size-8 lg:hidden"
                aria-label={`More actions for ${account.name}`}
              />
            }
          >
            <MoreHorizontalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem className="min-h-11 md:min-h-8" onClick={onEdit}>
              <EditIcon />
              Edit account
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 md:min-h-8"
              onClick={onReconcile}
            >
              <CheckCircle2Icon />
              Reconcile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden gap-2 lg:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Edit"
            aria-label={`Edit ${account.name}`}
            onClick={onEdit}
          >
            <EditIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Reconcile"
            aria-label={`Reconcile ${account.name}`}
            onClick={onReconcile}
          >
            <CheckCircle2Icon className="size-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
