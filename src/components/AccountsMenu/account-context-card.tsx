import { Amount } from "@/components/ui/amount";
import { Skeleton } from "@/components/ui/skeleton";
import { accountSummary } from "@/lib/account-display";
import { AccountForm } from "@/pages/Home/AccountForm";
import type { AccountWithBalances } from "@/types/electron";
import { useState } from "react";
import { AccountChooser } from "./account-chooser";

type AccountContextCardProps = {
  account: AccountWithBalances | undefined;
  accounts: AccountWithBalances[];
  className?: string;
};

/**
 * Selected-account context that replaces the accounts panel below `lg`. It
 * stays in normal document flow so it scrolls away with the list.
 */
export function AccountContextCard({
  account,
  accounts,
  className,
}: AccountContextCardProps) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <section
      aria-labelledby="selected-account-name"
      data-slot="account-context-card"
      className={className}
    >
      <div className="rounded-xl border bg-card px-4 py-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Selected account
        </p>
        {account ? (
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h2
                id="selected-account-name"
                className="text-lg font-semibold break-words"
              >
                {account.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {accountSummary(account)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-lg font-semibold tabular-nums">
                <Amount value={account.computedBalance} />
              </p>
            </div>
            <AccountChooser
              accounts={accounts}
              currentAccountId={account.id}
              onAddAccount={() => setFormOpen(true)}
              className="justify-self-start"
            />
            <p className="self-center text-right text-xs text-muted-foreground tabular-nums">
              Cleared balance <Amount value={account.clearedBalance} />
            </p>
          </div>
        ) : (
          <div aria-busy="true" className="mt-2 grid gap-2">
            <h2 id="selected-account-name" className="sr-only">
              Loading account
            </h2>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </div>
      <AccountForm open={formOpen} onOpenChange={setFormOpen} />
    </section>
  );
}
