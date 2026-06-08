import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FunnelIcon } from "lucide-react";

type AccountFilterProps = {
  accounts: Array<{ id: number; name: string }>;
  selectedAccountIds: Set<number>;
  onAccountChange: (accountId: number, checked: boolean) => void;
};

export function AccountFilter({
  accounts,
  selectedAccountIds,
  onAccountChange,
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
            size="icon-sm"
            aria-label="Filter accounts"
            title="Filter by account"
          />
        }
      >
        <FunnelIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Filter by account
        </p>
        <div className="flex flex-col gap-3">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-2">
              <input
                id={`filter-account-${account.id}`}
                type="checkbox"
                checked={selectedAccountIds.has(account.id)}
                onChange={(e) => onAccountChange(account.id, e.target.checked)}
                className="cursor-pointer"
              />
              <Label
                htmlFor={`filter-account-${account.id}`}
                className="cursor-pointer font-normal"
              >
                {account.name}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
