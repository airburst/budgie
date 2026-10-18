import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/useIsMobile";
import { accountSummary } from "@/lib/account-display";
import { cn } from "@/lib/utils";
import type { AccountWithBalances } from "@/types/electron";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

/** Lists shorter than this are scanned faster than searched. */
const SEARCH_THRESHOLD = 6;

type AccountChooserProps = {
  accounts: AccountWithBalances[];
  currentAccountId: number;
  onAddAccount: () => void;
  className?: string;
};

/**
 * "Change account" for the selected-account card: a bottom drawer on phones and
 * a popover from the trigger on tablets. Choosing navigates to the existing
 * route; closing leaves the current account unchanged.
 */
export function AccountChooser({
  accounts,
  currentAccountId,
  onAddAccount,
  className,
}: AccountChooserProps) {
  const compact = useIsMobile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(path: string) {
    handleOpenChange(false);
    navigate(path);
  }

  const list = (
    <AccountChooserList
      accounts={accounts}
      currentAccountId={currentAccountId}
      query={query}
      onQueryChange={setQuery}
      onChoose={(id) =>
        id === currentAccountId
          ? handleOpenChange(false)
          : go(`/accounts/${id}`)
      }
      onOverview={() => go("/")}
      onAddAccount={() => {
        handleOpenChange(false);
        onAddAccount();
      }}
    />
  );

  const triggerClassName = cn("min-h-11 md:min-h-8", className);

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          Change account
        </Button>
        <ResponsiveOverlay
          open={open}
          onOpenChange={(next) => handleOpenChange(next)}
        >
          <ResponsiveOverlayContent initialFocus={headingRef}>
            <ResponsiveOverlayHeader>
              <ResponsiveOverlayTitle ref={headingRef} tabIndex={-1}>
                Change account
              </ResponsiveOverlayTitle>
              <ResponsiveOverlayDescription>
                Choose the account to view.
              </ResponsiveOverlayDescription>
            </ResponsiveOverlayHeader>
            <ResponsiveOverlayBody>{list}</ResponsiveOverlayBody>
            <ResponsiveOverlayFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </ResponsiveOverlayFooter>
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <PopoverTrigger
        render={<Button variant="outline" className={triggerClassName} />}
      >
        Change account
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-(--available-height) w-80 overflow-y-auto"
        initialFocus={headingRef}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="px-1 text-sm font-semibold outline-none"
        >
          Change account
        </h2>
        {list}
      </PopoverContent>
    </Popover>
  );
}

type AccountChooserListProps = {
  accounts: AccountWithBalances[];
  currentAccountId: number;
  query: string;
  onQueryChange: (query: string) => void;
  onChoose: (id: number) => void;
  onOverview: () => void;
  onAddAccount: () => void;
};

function AccountChooserList({
  accounts,
  currentAccountId,
  query,
  onQueryChange,
  onChoose,
  onOverview,
  onAddAccount,
}: AccountChooserListProps) {
  const searchable = accounts.length >= SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? accounts.filter((a) => a.name.toLowerCase().includes(needle))
    : accounts;

  const itemClass =
    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring md:min-h-10";

  return (
    <div className="flex flex-col gap-2">
      {searchable && (
        <Input
          type="search"
          aria-label="Search accounts"
          placeholder="Search accounts"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      )}

      <button type="button" className={itemClass} onClick={onOverview}>
        <span className="flex-1 font-medium">All accounts</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Overview
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </span>
      </button>

      <ul aria-label="Accounts" className="flex flex-col gap-1">
        {visible.map((account) => {
          const selected = account.id === currentAccountId;
          return (
            <li key={account.id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                className={cn(itemClass, selected && "bg-accent/60")}
                onClick={() => onChoose(account.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">
                    {account.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {selected && (
                      <>
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                        Selected ·{" "}
                      </>
                    )}
                    {accountSummary(account)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  <Amount value={account.computedBalance} />
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            No accounts match “{query}”.
          </li>
        )}
      </ul>

      <Button
        variant="ghost"
        className="min-h-11 justify-start md:min-h-8"
        onClick={onAddAccount}
      >
        <PlusIcon />
        Add account
      </Button>
    </div>
  );
}
