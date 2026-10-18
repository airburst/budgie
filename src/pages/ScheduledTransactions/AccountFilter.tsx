import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FunnelIcon } from "lucide-react";

type AccountFilterProps = {
  accounts: Array<{ id: number; name: string }>;
  selectedAccountIds: Set<number>;
  onAccountChange: (accountId: number, checked: boolean) => void;
  onSelectAll: () => void;
  /** Visible scope text, e.g. "All accounts" or "2 accounts". */
  scopeLabel: string;
  className?: string;
};

export function AccountFilter({
  accounts,
  selectedAccountIds,
  onAccountChange,
  onSelectAll,
  scopeLabel,
  className,
}: AccountFilterProps) {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "min-h-11 max-w-full justify-start md:min-h-8",
              className,
            )}
            aria-label={`Filter accounts, ${scopeLabel}`}
          />
        }
      >
        <FunnelIcon className="size-4" />
        <span className="truncate">{scopeLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Filter by account
        </p>
        <ul className="flex flex-col">
          {accounts.map((account) => (
            <li key={account.id}>
              <Label
                htmlFor={`filter-account-${account.id}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 font-normal md:min-h-8"
              >
                <input
                  id={`filter-account-${account.id}`}
                  type="checkbox"
                  checked={selectedAccountIds.has(account.id)}
                  onChange={(e) =>
                    onAccountChange(account.id, e.target.checked)
                  }
                  className="size-4 cursor-pointer"
                />
                <span className="min-w-0 break-words">{account.name}</span>
              </Label>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          className="mt-2 min-h-11 w-full md:min-h-8"
          onClick={onSelectAll}
          disabled={selectedAccountIds.size === accounts.length}
        >
          Show all accounts
        </Button>
      </PopoverContent>
    </Popover>
  );
}
