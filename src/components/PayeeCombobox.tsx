import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { usePayees } from "@/hooks/usePayees";
import type { Payee } from "@/types/electron";
import { useState } from "react";

type PayeeComboboxProps = {
  value: string;
  onValueChange: (name: string) => void;
  onPayeeSelect: (payee: Payee) => void;
};

export function PayeeCombobox({
  value,
  onValueChange,
  onPayeeSelect,
}: PayeeComboboxProps) {
  const { payees } = usePayees();
  const [inputValue, setInputValue] = useState("");

  // Derive selected item from the current text value
  const selected = payees.find((p) => p.name === value) ?? null;

  function handleValueChange(payee: Payee | null) {
    if (payee) {
      onValueChange(payee.name);
      onPayeeSelect(payee);
    } else {
      onValueChange("");
    }
  }

  function handleInputChange(text: string) {
    setInputValue(text);
    onValueChange(text);
  }

  // Tab selects the first matching payee suggestion
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const needle = inputValue.toLowerCase();
    if (!needle) return;
    const match = payees.find((p) => p.name.toLowerCase().includes(needle));
    if (match) {
      e.preventDefault();
      onValueChange(match.name);
      onPayeeSelect(match);
    }
  }

  return (
    <Combobox
      items={payees}
      value={selected}
      itemToStringLabel={(p: Payee) => p.name}
      onValueChange={(p) => handleValueChange(p as Payee | null)}
      onInputValueChange={handleInputChange}
    >
      <ComboboxInput
        placeholder="e.g. Starbucks, Amazon..."
        showClear
        onKeyDown={handleKeyDown}
      />
      <ComboboxContent>
        <ComboboxList>
          {(payee: Payee) => (
            <ComboboxItem key={payee.id} value={payee}>
              {payee.name}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>
          <span className="py-2 text-xs text-muted-foreground">
            No saved payees
          </span>
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
