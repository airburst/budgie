import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { AccountWithBalances } from "@/types/electron";

type Props = {
  accounts: AccountWithBalances[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

export function AccountSelect({ accounts, selectedIds, onChange }: Props) {
  const selectedNames = accounts
    .filter((a) => selectedIds.includes(a.id))
    .map((a) => a.name);

  return (
    <Combobox
      multiple
      value={selectedNames}
      onValueChange={(names) => {
        const ids = accounts
          .filter((a) => names.includes(a.name))
          .map((a) => a.id);
        onChange(ids);
      }}
    >
      <ComboboxInput
        placeholder={selectedIds.length === 0 ? "All Accounts" : `${selectedIds.length} account${selectedIds.length > 1 ? "s" : ""}`}
        showClear={selectedIds.length > 0}
        className="w-40"
      />
      <ComboboxContent>
        <ComboboxList>
          {accounts.map((a) => (
            <ComboboxItem key={a.id} value={a.name}>
              {a.name}
            </ComboboxItem>
          ))}
          <ComboboxEmpty>No accounts found</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
